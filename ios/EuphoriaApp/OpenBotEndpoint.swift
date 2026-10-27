import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The person-supplied origin of their existing OpenBot deployment.
/// Never accepts embedded credentials, arbitrary paths, or remote plaintext HTTP.
struct OpenBotEndpoint: Equatable, Sendable {
    let baseURL: URL

    init(_ raw: String) throws {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let host = components.host, !host.isEmpty,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              let scheme = components.scheme?.lowercased()
        else {
            throw EndpointError.invalidOrigin
        }

        switch scheme {
        case "https":
            break
        case "http":
            #if DEBUG
            guard ["localhost", "127.0.0.1", "::1"].contains(host.lowercased()) else {
                throw EndpointError.insecureTransport
            }
            #else
            throw EndpointError.insecureTransport
            #endif
        default:
            throw EndpointError.insecureTransport
        }

        components.scheme = scheme
        components.path = ""
        guard let url = components.url else {
            throw EndpointError.invalidOrigin
        }
        baseURL = url
    }
}

enum EndpointError: LocalizedError {
    case invalidOrigin
    case insecureTransport

    var errorDescription: String? {
        switch self {
        case .invalidOrigin:
            return "Enter only the OpenBot deployment origin, without a path, credentials, query or fragment."
        case .insecureTransport:
            return "Use HTTPS. Plain HTTP is restricted to loopback in Debug builds."
        }
    }
}

/// Public, deliberately non-authenticating projection of server capabilities.
/// A valid response is *not* proof of a signed-in session or an agent run.
struct DeploymentCapabilities: Decodable, Sendable, Equatable {
    let mode: String?
    let durableHistory: Bool?
    let generativeUi: Bool?
    let authProviders: [String]?
    let ssoConfigured: Bool?
    let ssoRequired: Bool?
}

enum OpenBotAPIError: LocalizedError {
    case nonHTTPResponse
    case unexpectedStatus(Int)

    var errorDescription: String? {
        switch self {
        case .nonHTTPResponse:
            return "The deployment returned a non-HTTP response."
        case .unexpectedStatus(let code):
            return "The deployment declined the capabilities request (HTTP \(code))."
        }
    }
}

struct OpenBotAPI {
    /// Actual server-defined GET /api/capabilities. No keys, cookies or synthetic data.
    func capabilities(at endpoint: OpenBotEndpoint) async throws -> DeploymentCapabilities {
        let url = endpoint.baseURL
            .appendingPathComponent("api")
            .appendingPathComponent("capabilities")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        let (data, response) = try await URLSession.shared.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else {
            throw OpenBotAPIError.nonHTTPResponse
        }
        guard http.statusCode == 200 else {
            throw OpenBotAPIError.unexpectedStatus(http.statusCode)
        }
        return try JSONDecoder().decode(DeploymentCapabilities.self, from: data)
    }
}
