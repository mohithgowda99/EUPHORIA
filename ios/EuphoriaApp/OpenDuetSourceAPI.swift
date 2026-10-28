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
struct SourceRoutine: Decodable, Identifiable, Sendable {
    let id: String
    let agentId: String
    let schedule: String
    let timezone: String
    let instruction: String
    let channel: SourceRoutineChannel
    let enabled: Bool
    let nextRunAt: String
    let lastRun: SourceRoutineOutcome?
}
struct SourceRoutineChannel: Decodable, Sendable {
    let id: String
    let name: String?
    let gone: Bool
}
struct SourceRoutineOutcome: Decodable, Sendable {
    let status: String?
    let at: String?
}
struct SourceRoutinesResponse: Decodable, Sendable {
    let routines: [SourceRoutine]
    let sweep: SourceRoutineSweep
}
struct SourceRoutineSweep: Decodable, Sendable {
    let lastSweptAt: String?
    let working: Bool
}
struct SourceRoutineRun: Decodable, Identifiable, Sendable {
    let id: String
    let status: String
    let startedAt: String
    let finishedAt: String?
    let error: String?
}
struct SourceRoutineRunsResponse: Decodable, Sendable { let runs: [SourceRoutineRun] }
private struct SourceRoutineEnabledInput: Encodable { let enabled: Bool }
private struct SourceRoutineEnabledResult: Decodable { let enabled: Bool }

struct SourceTask: Decodable, Identifiable, Sendable {
    let id: String
    let botId: String
    let channelId: String
    let title: String
    let why: String?
    let status: String
    let next: String?
    let failure: String?
    let resolvedAt: String?
    let createdAt: String
    let updatedAt: String
}
struct SourceTasksResponse: Decodable, Sendable { let tasks: [SourceTask] }
struct SourceTaskResponse: Decodable, Sendable { let task: SourceTask }
struct SourceTaskReportEnvelope: Decodable, Sendable { let report: SourceTaskReport }
struct SourceTaskReport: Decodable, Sendable {
    let taskId: String
    let entries: [SourceTaskReportEntry]
    let resources: [SourceTaskResource]
}
struct SourceTaskReportEntry: Decodable, Identifiable, Sendable {
    let kind: String
    let id: String
    let text: String?
    let decision: String?
    let at: String?
}
struct SourceTaskResource: Decodable, Identifiable, Sendable {
    let kind: String
    let id: String
    let title: String?
    let subject: String?
    let from: String?
    let link: String?
}
private struct SourceTaskCreateInput: Encodable {
    let botId: String
    let instruction: String
    let title: String
}
private struct SourceTaskReplyInput: Encodable {
    let reply: String
    let messageId: String
}
struct SourceConversation: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let agentIds: [String]
    let active: Bool
}
struct SourceConversationsResponse: Decodable, Sendable {
    let conversations: [SourceConversation]
    let nextCursor: String?
}
struct SourceConversationResponse: Decodable, Sendable {
    let channel: SourceConversation
}
struct SourceChannelInput: Encodable { let agentIds: [String] }
struct SourceConversationText: Decodable, Identifiable, Sendable {
    let id: String
    let role: String
    let text: String
    let unsupportedContent: Bool

    private enum CodingKeys: String, CodingKey { case id, role, content }
    private struct TextPart: Decodable { let text: String? }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        role = try container.decode(String.self, forKey: .role)
        if let string = try? container.decode(String.self, forKey: .content) {
            text = string
            unsupportedContent = false
        } else if let parts = try? container.decode([TextPart].self, forKey: .content) {
            text = parts.compactMap(\.text).joined(separator: "\n")
            unsupportedContent = parts.contains { $0.text == nil }
        } else {
            text = ""
            unsupportedContent = true
        }
    }
}
struct SourceHistoryResponse: Decodable, Sendable {
    let history: SourceHistory
}
struct SourceHistory: Decodable, Sendable {
    let messages: [SourceConversationText]
    init(from decoder: Decoder) throws {
        let single = try decoder.singleValueContainer()
        if let list = try? single.decode([SourceConversationText].self) {
            messages = list
        } else {
            let object = try single.decode(Nested.self)
            messages = object.messages
        }
    }
    private struct Nested: Decodable { let messages: [SourceConversationText] }
}
private struct SourceMessageInput: Encodable {
    let agentId: String
    let text: String
    let externalId: String
}
struct SourceApprovalAction: Decodable, Sendable {
    let botId: String?
    let toolRef: String?
    let effect: String?
    let scope: String?
}
struct SourceApproval: Decodable, Identifiable, Sendable {
    let id: String
    let status: String
    let botId: String?
    let toolRef: String?
    let effect: String?
    let scope: String?
    let action: SourceApprovalAction?
}
struct SourcePersonQuestion: Decodable, Identifiable, Sendable {
    let id: String
    let question: String
    let why: String?
    let botId: String
    let channelId: String?
}
struct SourceApprovalInbox: Decodable, Sendable {
    let requests: [SourceApproval]
    let questions: [SourcePersonQuestion]?
}
private struct SourceQuestionResponse: Encodable { let response: String }
private struct SourceApprovalDecisionInput: Encodable { let decision: String }
struct SourceApprovalDecisionResult: Decodable, Sendable {
    let id: String
    let status: String
}
struct SourceMemory: Decodable, Identifiable, Sendable {
    let id: String
    let content: String
    let provenance: String
    let enabled: Bool
    let reviewState: String
    let formedBy: String
}
struct SourceMemoriesResponse: Decodable, Sendable { let memories: [SourceMemory] }
struct SourceMemoryResponse: Decodable, Sendable { let memory: SourceMemory }
private struct SourceNewMemoryInput: Encodable { let content: String }
private struct SourceMemoryContentPatch: Encodable { let content: String }
private struct SourceMemoryEnabledPatch: Encodable { let enabled: Bool }
private struct SourceMemoryReviewPatch: Encodable { let reviewState: String }

/// One authenticated account boundary for every original OpenDuet product tab.
enum SavedOpenDuetAccount {
    static func client() throws -> OpenDuetSourceAPI {
        guard let raw = UserDefaults.standard.string(forKey: "euphoria.openduet.origin")
        else { throw SourceAPIError.unauthenticated }
        let endpoint = try OpenBotEndpoint(raw)
        guard let cookie = SourceSessionKeychain.load(origin: endpoint.baseURL)
        else { throw SourceAPIError.unauthenticated }
        return OpenDuetSourceAPI(endpoint: endpoint, cookie: cookie)
    }
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
        // A trusted account cookie must never follow a server redirect to
        // another origin, including a maliciously configured agent endpoint.
        self.session = session ?? URLSession(configuration: config,
            delegate: SourceRejectRedirects(), delegateQueue: nil)
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

    /// Existing OpenDuet routine metadata, run history and pause controls.
    /// Managed Agents Automations has not been wired yet: do not create a
    /// competing scheduler or imply that original sweeps are managed dispatch.
    func sourceRoutines() async throws -> SourceRoutinesResponse {
        try await get("api/routines")
    }
    func sourceRoutineRuns(id: String) async throws -> [SourceRoutineRun] {
        let page: SourceRoutineRunsResponse = try await get("api/routines/" + checkedID(id) + "/runs")
        return page.runs
    }
    func pauseSourceRoutine(id: String) async throws {
        let response: SourceRoutineEnabledResult = try await request(
            "api/routines/" + checkedID(id) + "/enabled", method: "PUT",
            body: SourceRoutineEnabledInput(enabled: false))
        guard response.enabled == false else { throw SourceAPIError.invalidResponse }
    }

    /// This endpoint uses the ORIGINAL OpenDuet TaskStore/TaskThreads.
    /// It must never be confused with gateway /v1/tasks metadata.
    func sourceTasks() async throws -> [SourceTask] {
        let response: SourceTasksResponse = try await get("api/openduet/tasks")
        guard response.tasks.count <= 2000,
              Set(response.tasks.map(\.id)).count == response.tasks.count,
              response.tasks.allSatisfy { ["needs_input","working","ready_for_review","failed","resolved"].contains($0.status) }
        else { throw SourceAPIError.invalidResponse }
        return response.tasks
    }
    func sourceTask(id: String) async throws -> SourceTask {
        let response: SourceTaskResponse = try await get("api/openduet/tasks/" + checkedID(id))
        guard response.task.id == id else { throw SourceAPIError.invalidResponse }
        return response.task
    }
    func sourceTaskReport(id: String) async throws -> SourceTaskReport {
        let report: SourceTaskReportEnvelope = try await get("api/openduet/tasks/" + checkedID(id) + "/report")
        guard report.report.taskId == id else { throw SourceAPIError.invalidResponse }
        return report.report
    }
    /// The original API does not accept a creation idempotency key. Call once;
    /// if its response is lost, inspect original tasks instead of repeating POST.
    func createSourceTask(botID: String, title: String, instruction: String) async throws -> SourceTask {
        let safeTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeInstruction = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...160).contains(safeTitle.count), (1...4000).contains(safeInstruction.count)
        else { throw SourceAPIError.invalidInput }
        let response: SourceTaskResponse = try await request("api/openduet/tasks", method: "POST",
            body: SourceTaskCreateInput(botId: checkedID(botID), instruction: safeInstruction, title: safeTitle))
        return response.task
    }
    func sourceTaskReply(id: String, message: String, messageID: String) async throws -> SourceTask {
        guard UUID(uuidString: messageID) != nil,
              (1...4000).contains(message.trimmingCharacters(in: .whitespacesAndNewlines).count)
        else { throw SourceAPIError.invalidInput }
        let response: SourceTaskResponse = try await request("api/openduet/tasks/" + checkedID(id) + "/reply",
            method: "POST", body: SourceTaskReplyInput(reply: message, messageId: messageID))
        guard response.task.id == id else { throw SourceAPIError.invalidResponse }
        return response.task
    }
    func sourceSetTaskResolved(id: String, resolved: Bool) async throws -> SourceTask {
        let response: SourceTaskResponse = try await request(
            "api/openduet/tasks/" + checkedID(id) + (resolved ? "/resolve" : "/reopen"), method: "POST")
        guard response.task.id == id else { throw SourceAPIError.invalidResponse }
        return response.task
    }

    /// The original source channel list and delivery queue are the only
    /// channel and message authorities. No provider session is mislabeled.
    func sourceConversations(cursor: String? = nil) async throws -> SourceConversationsResponse {
        let query = cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []
        let response: SourceConversationsResponse = try await request(
            "api/delivery/conversations", method: "GET", queryItems: query)
        guard response.conversations.count <= 150,
              Set(response.conversations.map(\.id)).count == response.conversations.count
        else { throw SourceAPIError.invalidResponse }
        return response
    }
    func sourceConversation(id: String) async throws -> SourceConversation {
        let response: SourceConversationResponse = try await get("api/channels/" + checkedID(id))
        guard response.channel.id == id else { throw SourceAPIError.invalidResponse }
        return response.channel
    }
    func createSourceConversation(withBot id: String) async throws -> SourceConversation {
        let response: SourceConversationResponse = try await request("api/channels",
            method: "POST", body: SourceChannelInput(agentIds: [checkedID(id)]))
        return response.channel
    }
    func sourceHistory(channelID: String, agentID: String) async throws -> [SourceConversationText] {
        let response: SourceHistoryResponse = try await request(
            "api/delivery/conversations/" + checkedID(channelID) + "/history",
            method: "GET", queryItems: [URLQueryItem(name: "agentId", value: checkedID(agentID))])
        return response.history.messages
    }
    func sendSourceMessage(channelID: String, botID: String, text: String, externalID: String) async throws {
        guard UUID(uuidString: externalID) != nil,
              (1...16_000).contains(text.trimmingCharacters(in: .whitespacesAndNewlines).count)
        else { throw SourceAPIError.invalidInput }
        // The original DeliveryRouter.offerInbox deduplicates externalId.
        let _: SourceReceivedMessage = try await request(
            "api/delivery/conversations/" + checkedID(channelID) + "/messages",
            method: "POST", body: SourceMessageInput(agentId: checkedID(botID),
                text: text, externalId: externalID))
    }

    /// Source ApprovalService owns every decision and subsequent tool effect.
    /// This transport deliberately never implements approval policy or execution.
    func approvalInbox() async throws -> SourceApprovalInbox {
        try await get("api/approvals")
    }
    func refuseApproval(id: String) async throws -> SourceApprovalDecisionResult {
        let response: SourceApprovalDecisionResult = try await request(
            "api/approvals/" + checkedID(id) + "/decision", method: "POST",
            body: SourceApprovalDecisionInput(decision: "deny"))
        guard response.id == id else { throw SourceAPIError.invalidResponse }
        return response
    }
    func answerQuestion(id: String, response: String) async throws {
        let safe = response.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...6000).contains(safe.count) else { throw SourceAPIError.invalidInput }
        let _: SourceQuestionAnswerReceipt = try await request(
            "api/approvals/questions/" + checkedID(id) + "/respond", method: "POST",
            body: SourceQuestionResponse(response: safe))
    }

    /// User-editable memory remains in original OpenDuet MemoryStore, not an
    /// Agents session's context. Every mutation is authorized by requireUser.
    func memories() async throws -> [SourceMemory] {
        let response: SourceMemoriesResponse = try await get("api/memory")
        guard response.memories.count <= 2000,
              Set(response.memories.map(\.id)).count == response.memories.count
        else { throw SourceAPIError.invalidResponse }
        return response.memories
    }
    func remember(_ content: String) async throws -> SourceMemory {
        let safe = try checkedMemoryContent(content)
        let response: SourceMemoryResponse = try await request(
            "api/memory", method: "POST", body: SourceNewMemoryInput(content: safe))
        return response.memory
    }
    func editMemory(id: String, content: String) async throws -> SourceMemory {
        let safe = try checkedMemoryContent(content)
        let response: SourceMemoryResponse = try await request(
            "api/memory/" + checkedMemoryID(id), method: "PATCH",
            body: SourceMemoryContentPatch(content: safe))
        guard response.memory.id == id else { throw SourceAPIError.invalidResponse }
        return response.memory
    }
    func setMemoryEnabled(id: String, enabled: Bool) async throws -> SourceMemory {
        let response: SourceMemoryResponse = try await request(
            "api/memory/" + checkedMemoryID(id), method: "PATCH",
            body: SourceMemoryEnabledPatch(enabled: enabled))
        guard response.memory.id == id else { throw SourceAPIError.invalidResponse }
        return response.memory
    }
    func confirmMemory(id: String) async throws -> SourceMemory {
        let response: SourceMemoryResponse = try await request(
            "api/memory/" + checkedMemoryID(id), method: "PATCH",
            body: SourceMemoryReviewPatch(reviewState: "confirmed"))
        guard response.memory.id == id else { throw SourceAPIError.invalidResponse }
        return response.memory
    }
    func deleteMemory(id: String) async throws {
        let _: SourceVoidResponse = try await request("api/memory/" + checkedMemoryID(id), method: "DELETE")
    }
    private func checkedMemoryContent(_ content: String) throws -> String {
        let safe = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...6000).contains(safe.count) else { throw SourceAPIError.invalidInput }
        return safe
    }
    private func checkedMemoryID(_ id: String) throws -> String {
        // Source records can be prefixed "intelligence:"; do not invent new IDs
        // or strip that provenance when addressing their original route.
        guard (1...180).contains(id.count),
              id.range(of: "^[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$", options: .regularExpression) != nil
        else { throw SourceAPIError.invalidInput }
        return id
    }

    /// Uses the ORIGINAL Better Auth provider initiation, not an EUPHORIA auth server.
    func socialAuthorizationURL(provider: String) async throws -> URL {
        guard ["google","microsoft","okta"].contains(provider) else { throw SourceAPIError.invalidInput }
        let response: SourceSignInLaunch = try await request("api/auth/sign-in/social", method: "POST",
            body: SourceSocialInput(provider: provider, callbackURL: "openbotmobile://"))
        guard let raw = response.url, let target = URL(string: raw),
              target.scheme?.lowercased() == "https", target.user == nil,
              target.password == nil, target.fragment == nil
        else { throw SourceAPIError.invalidResponse }
        // The source @better-auth/expo client does NOT open the provider URL
        // directly. Its same-origin proxy transfers the OAuth state cookie into
        // the system browser before redirecting. Without that, native sign-in
        // silently fails state verification after the provider comes back.
        var proxy = URLComponents(url: endpoint.baseURL
            .appendingPathComponent("api/auth/expo-authorization-proxy"),
            resolvingAgainstBaseURL: false)
        proxy?.queryItems = [URLQueryItem(name: "authorizationURL", value: raw)]
        guard let proxyURL = proxy?.url else { throw SourceAPIError.invalidResponse }
        return proxyURL
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
    private func request<T: Decodable>(_ path: String, method: String, body: (any Encodable)? = nil,
                                       queryItems: [URLQueryItem] = []) async throws -> T {
        guard !path.hasPrefix("/"), !path.contains(".."), !path.contains("?") else {
            throw SourceAPIError.invalidInput
        }
        var components = URLComponents(url: endpoint.baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false)
        if !queryItems.isEmpty { components?.queryItems = queryItems }
        guard let url = components?.url else { throw SourceAPIError.invalidInput }
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
private final class SourceRejectRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
private struct SourceSocialInput: Encodable {
    let provider: String
    let callbackURL: String
}
private struct SourceVoidResponse: Decodable {}
private struct SourceReceivedMessage: Decodable {}

private struct SourceQuestionAnswerReceipt: Decodable {
    // Source answerQuestion returns the original service's queued outcome.
    // Accept a JSON object, but never infer completion from HTTP acceptance.
    let id: String?
    let status: String?
}

private struct AnyEncodableSource: Encodable {
    let encodeValue: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}
