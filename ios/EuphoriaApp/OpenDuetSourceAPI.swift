import Foundation
import Security
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Native transport for the ORIGINAL OpenDuet/OpenBot product routes.
/// Deliberately independent of the transitional EUPHORIA Agents session routes:
/// Bot identity, permission checks, credentials and lifecycle stay in OpenBot.
struct SourceBot: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let title: String
    let roleDescription: String
    let visibility: String
    let ownerUserId: String?
    let mine: Bool
    let canManage: Bool
    let systemOwned: Bool
    let hidden: Bool
    let pinned: Bool
    let deletedAt: String?
    let endpoint: String?
    let builtIn: Bool?
    let hasAuth: Bool
    let hasCallbackToken: Bool
}
struct SourceBotsResponse: Decodable, Sendable { let agents: [SourceBot] }
struct SourceBotResponse: Decodable, Sendable { let agent: SourceBot }
struct SourceBotCapabilitiesEnvelope: Decodable, Sendable {
    let capabilities: SourceBotCapabilities
}
struct SourceBotCapabilities: Decodable, Sendable { let builtInAvailable: Bool }
struct SourceAuthenticatedSession: Decodable, Sendable {
    let user: SourceUser
}
struct SourceUser: Decodable, Sendable {
    let id: String
    let email: String
    let name: String?
}
struct SourceSignInLaunch: Decodable, Sendable {
    let url: String?
}
struct SourceBotInput: Encodable, Sendable {
    let name: String
    let title: String
    let roleDescription: String
    let visibility: String

    init(name: String, title: String, instructions: String) throws {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...80).contains(n.count), (1...120).contains(t.count),
              (1...1000).contains(body.count) else { throw SourceAPIError.invalidInput }
        self.name = n
        self.title = t
        self.roleDescription = body
        // Private by default: publishing a Bot gives everyone in the deployment access.
        self.visibility = "private"
    }
}

enum SourceAPIError: LocalizedError {
    case unauthenticated
    case invalidInput
    case invalidResponse
    case rejected(Int)
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unauthenticated: return "Sign in to the original OpenDuet account before managing Bots."
        case .invalidInput: return "Check the Bot name, title and instructions."
        case .invalidResponse: return "The OpenDuet service returned an unexpected response."
        case .rejected(let code): return "OpenDuet rejected this request (HTTP \(code))."
        case .unavailable: return "The OpenDuet service is unreachable."
        }
    }
}

/// The Better Auth native redirect carries Set-Cookie, not an API key.
/// Extract only the signed session token from the source plugin's callback.
/// It is later validated by the ORIGINAL /api/auth/get-session endpoint.
enum SourceSessionCookie {
    static func extract(from callback: URL) throws -> String {
        guard callback.scheme?.lowercased() == "openbotmobile",
              let payload = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "cookie" })?.value,
              payload.count <= 16_384,
              !payload.contains("\r"), !payload.contains("\n")
        else { throw SourceAPIError.unauthenticated }

        // Better Auth's source expo() plugin puts the original Set-Cookie
        // header in the native callback. Do not persist attributes, unrelated
        // cookie names or any third-party cookies.
        let pattern = #"(?:^|,)\s*((?:__Secure-)?better-auth\.session_token)=([^;,\s]+)"#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(payload.startIndex..<payload.endIndex, in: payload)
        guard let match = regex.firstMatch(in: payload, range: range),
              let nameRange = Range(match.range(at: 1), in: payload),
              let valueRange = Range(match.range(at: 2), in: payload)
        else { throw SourceAPIError.unauthenticated }
        return String(payload[nameRange]) + "=" + String(payload[valueRange])
    }
}

/// Store an original server-verified session cookie in iOS Keychain,
/// NEVER in source files, UserDefaults, cloud sync or the gateway state DB.
struct SourceSessionKeychain {
    private static let service = "dev.euphoria.openduet.session"
    static func load(origin: URL) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: origin.absoluteString,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var output: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &output) == errSecSuccess,
              let data = output as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func store(_ cookie: String, origin: URL) throws {
        guard cookie.hasPrefix("better-auth.session_token=") ||
              cookie.hasPrefix("__Secure-better-auth.session_token=")
        else { throw SourceAPIError.invalidInput }
        let key: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: origin.absoluteString
        ]
        SecItemDelete(key as CFDictionary)
        var add = key
        add[kSecValueData as String] = Data(cookie.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        else { throw SourceAPIError.unavailable }
    }
    static func clear(origin: URL) {
        let key: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: origin.absoluteString
        ]
        SecItemDelete(key as CFDictionary)
    }
}

/// No account store or permissions implementation here. Every request goes to
/// source Hono routes, which call Better Auth requireUser and ProfileStore.
struct OpenDuetSourceAPI: Sendable {
    let endpoint: OpenBotEndpoint
    let sessionCookie: String?
    let session: URLSession

    init(endpoint: OpenBotEndpoint, cookie: String? = nil, session: URLSession? = nil) {
        self.endpoint = endpoint
        self.sessionCookie = cookie
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        self.session = session ?? URLSession(configuration: config)
    }

    func capabilities() async throws -> DeploymentCapabilities {
        try await get("api/capabilities")
    }
    func sourceSession() async throws -> SourceAuthenticatedSession {
        try await get("api/auth/get-session")
    }
    func botCapabilities() async throws -> SourceBotCapabilities {
        let response: SourceBotCapabilitiesEnvelope = try await get("api/agents/capabilities")
        return response.capabilities
    }
    func bots() async throws -> [SourceBot] {
        let response: SourceBotsResponse = try await get("api/agents")
        guard response.agents.count <= 1000,
              Set(response.agents.map(\.id)).count == response.agents.count
        else { throw SourceAPIError.invalidResponse }
        return response.agents
    }
    func bot(id: String) async throws -> SourceBot {
        let response: SourceBotResponse = try await get("api/agents/" + checkedID(id))
        guard response.agent.id == id else { throw SourceAPIError.invalidResponse }
        return response.agent
    }
    func createBot(_ input: SourceBotInput) async throws -> SourceBot {
        let response: SourceBotResponse = try await request("api/agents", method: "POST", body: input)
        return response.agent
    }
    func updateBot(id: String, input: SourceBotInput) async throws -> SourceBot {
        let response: SourceBotResponse = try await request("api/agents/" + checkedID(id), method: "PATCH", body: input)
        guard response.agent.id == id else { throw SourceAPIError.invalidResponse }
        return response.agent
    }
    func hideBot(id: String, hidden: Bool) async throws {
        let _: SourceVoidResponse = try await request(
            "api/agents/" + checkedID(id) + (hidden ? "/hide" : "/unhide"), method: "POST")
    }
    func deleteBot(id: String) async throws {
        let _: SourceVoidResponse = try await request("api/agents/" + checkedID(id), method: "DELETE")
    }

    func pinBot(id: String, pinned: Bool) async throws {
        let _: SourceVoidResponse = try await request(
            "api/agents/" + checkedID(id) + (pinned ? "/pin" : "/unpin"), method: "POST")
    }
    func duplicateBot(id: String) async throws -> SourceBot {
        let response: SourceBotResponse = try await request(
            "api/agents/" + checkedID(id) + "/duplicate", method: "POST")
        return response.agent
    }

    /// Uses the ORIGINAL Better Auth provider initiation, not an EUPHORIA auth server.
    func socialAuthorizationURL(provider: String) async throws -> URL {
        guard ["google","microsoft","okta"].contains(provider) else { throw SourceAPIError.invalidInput }
        let response: SourceSignInLaunch = try await request("api/auth/sign-in/social", method: "POST",
            body: SourceSocialInput(provider: provider, callbackURL: "openbotmobile://"))
        guard let raw = response.url, let url = URL(string: raw),
              url.scheme?.lowercased() == "https", url.user == nil,
              url.password == nil
        else { throw SourceAPIError.invalidResponse }
        return url
    }

    private func checkedID(_ value: String) throws -> String {
        guard (1...128).contains(value.count),
              value.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", options: .regularExpression) != nil
        else { throw SourceAPIError.invalidInput }
        return value
    }
    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET")
    }
    private func request<T: Decodable>(_ path: String, method: String, body: (any Encodable)? = nil) async throws -> T {
        guard !path.hasPrefix("/"), !path.contains(".."), !path.contains("?") else {
            throw SourceAPIError.invalidInput
        }
        let url = endpoint.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let sessionCookie { req.setValue(sessionCookie, forHTTPHeaderField: "Cookie") }
        if let body {
            req.httpBody = try JSONEncoder().encode(AnyEncodableSource(body))
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: req) }
        catch { throw SourceAPIError.unavailable }
        guard let http = response as? HTTPURLResponse else { throw SourceAPIError.invalidResponse }
        guard http.statusCode != 401 else { throw SourceAPIError.unauthenticated }
        guard (200..<300).contains(http.statusCode) else { throw SourceAPIError.rejected(http.statusCode) }
        if http.statusCode == 204 {
            guard let empty = SourceVoidResponse() as? T else { throw SourceAPIError.invalidResponse }
            return empty
        }
        guard data.count <= 1_048_576 else { throw SourceAPIError.invalidResponse }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw SourceAPIError.invalidResponse }
    }
}
private struct SourceSocialInput: Encodable {
    let provider: String
    let callbackURL: String
}
private struct SourceVoidResponse: Decodable {}
private struct AnyEncodableSource: Encodable {
    let encodeValue: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}
