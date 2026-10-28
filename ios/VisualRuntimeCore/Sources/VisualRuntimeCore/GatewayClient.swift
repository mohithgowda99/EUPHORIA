import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum GatewayClientError: Error, Equatable, LocalizedError {
    case invalidConnection, invalidResponse, httpStatus(Int), transport
    public var errorDescription: String? {
        switch self {
        case .invalidConnection: return "A secure gateway connection is required."
        case .invalidResponse: return "The gateway returned an unsupported response."
        case .httpStatus(let code): return "The gateway rejected this request (\(code))."
        case .transport: return "Connection interrupted. Refresh before sending again; the request may have been accepted."
        }
    }
}
public struct GatewayConnection: Sendable {
    public let url: URL
    fileprivate let token: String
    public init(url raw: String, token: String, allowLoopback: Bool = false) throws {
        guard let url = URL(string: raw), let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.scheme == "https" || (allowLoopback && url.scheme == "http" && ["127.0.0.1", "localhost", "::1", "[::1]"].contains(host)),
              !token.isEmpty, !token.contains("\r"), !token.contains("\n") else { throw GatewayClientError.invalidConnection }
        self.url = url; self.token = token
    }
}
public struct GatewayEnvelope: Decodable, Sendable {
    public let sessionID: String?
    public let phase: String
    public let publication: Int?
    public let title: String?
    public let surface: VisualSurface?
    public let acknowledgedActionIDs: Set<String>
    public let rejectedActionIDs: Set<String>
    public let verificationMode: String
    public let displayAcknowledged: Bool
    public let resolvedNodeIDs: Set<String>
    private enum CodingKeys: String, CodingKey { case sessionID, phase, publication, title, surface, acknowledgedActionIDs, resolvedNodeIDs, rejectedActionIDs, verificationMode, displayAcknowledged }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionID = try c.decodeIfPresent(String.self, forKey: .sessionID)
        phase = try c.decode(String.self, forKey: .phase)
        publication = try c.decodeIfPresent(Int.self, forKey: .publication)
        guard publication == nil || publication! >= 0 else { throw GatewayClientError.invalidResponse }
        title = try c.decodeIfPresent(String.self, forKey: .title)
        verificationMode = try c.decodeIfPresent(String.self, forKey: .verificationMode) ?? "unverified"
        displayAcknowledged = try c.decodeIfPresent(Bool.self, forKey: .displayAcknowledged) ?? false
        rejectedActionIDs = try c.decodeIfPresent(Set<String>.self, forKey: .rejectedActionIDs) ?? []
        surface = try c.decodeIfPresent(VisualSurface.self, forKey: .surface)
        acknowledgedActionIDs = try c.decode(Set<String>.self, forKey: .acknowledgedActionIDs)
        resolvedNodeIDs = try c.decode(Set<String>.self, forKey: .resolvedNodeIDs)
        guard phase.count <= 64, acknowledgedActionIDs.count <= 500, rejectedActionIDs.count <= 500,
              resolvedNodeIDs.isSubset(of: Set(surface?.nodes.map(\.id) ?? [])) else { throw GatewayClientError.invalidResponse }
    }
}
/// Only connects to the EUPHORIA gateway. Never accepts an OpenAI API credential or provider URL.
public struct GatewayClient: Sendable {
    private let connection: GatewayConnection
    private let session: URLSession
    public init(connection: GatewayConnection, session: URLSession? = nil) {
        self.connection = connection
        self.session = session ?? URLSession(configuration: .ephemeral, delegate: RejectGatewayRedirects(), delegateQueue: nil)
    }
    public func create(message: String, requestID: String) async throws -> GatewayEnvelope {
        struct Input: Encodable { let id: String; let message: String }
        return try await request("v1/sessions", method: "POST", data: JSONEncoder().encode(Input(id: requestID, message: message)))
    }
    public func refresh(sessionID: String) async throws -> GatewayEnvelope {
        try await request("v1/sessions/" + validatedID(sessionID))
    }
    public func recover(requestID: String) async throws -> GatewayEnvelope {
        try await request("v1/requests/" + validatedID(requestID))
    }
    public func listSessions() async throws -> GatewaySessionList { try await request("v1/sessions") }
    public func sendMessage(sessionID: String, message: String, id: String) async throws -> GatewayInputReceipt {
        struct Input: Encodable { let id: String; let message: String }
        return try await request("v1/sessions/" + validatedID(sessionID) + "/messages", method: "POST",
            data: JSONEncoder().encode(Input(id: id, message: message)))
    }
    public func cancel(sessionID: String, id: String) async throws -> GatewayInputReceipt {
        struct Input: Encodable { let id: String }
        return try await request("v1/sessions/" + validatedID(sessionID) + "/cancel", method: "POST", data: JSONEncoder().encode(Input(id: id)))
    }
    public func history(sessionID: String, after: String? = nil) async throws -> GatewayHistoryPage {
        var path = "v1/sessions/" + (try validatedID(sessionID)) + "/items?limit=10"
        if let after { path += "&after=" + (try validatedID(after)) }
        return try await request(path)
    }
    public func inputReceipts(sessionID: String, resolving ids: [String]? = nil) async throws -> GatewayInputReceipts {
        struct Input: Encodable { let ids: [String] }
        let path = "v1/sessions/" + (try validatedID(sessionID)) + "/inputs"
        if let ids { return try await request(path + "/reconcile", method: "POST", data: JSONEncoder().encode(Input(ids: ids))) }
        return try await request(path)
    }
    public func cancelCreation(requestID: String) async throws -> GatewayEnvelope {
        try await request("v1/requests/" + validatedID(requestID), method: "DELETE")
    }
    public func reconcile(surfaceID: String, pendingActionIDs: [String]) async throws -> GatewayEnvelope {
        struct Input: Encodable { let pendingActionIDs: [String] }
        return try await request("v1/surfaces/" + validatedID(surfaceID) + "/reconcile", method: "POST",
            data: JSONEncoder().encode(Input(pendingActionIDs: pendingActionIDs)))
    }
    public func submit(_ action: VisualAction) async throws -> GatewayEnvelope {
        try await request("v1/surfaces/" + validatedID(action.surfaceID) + "/actions", method: "POST", data: JSONEncoder().encode(action))
    }
    #if canImport(Darwin)
    @available(macOS 12.0, *)
    public func watch(sessionID: String, onUpdate: @Sendable (GatewayLiveUpdate) async throws -> Void) async throws {
        let id = try validatedID(sessionID)
        var req = URLRequest(url: connection.url.appendingPathComponent("v1/sessions/" + id + "/events"), timeoutInterval: 65)
        req.setValue("Bearer " + connection.token, forHTTPHeaderField: "Authorization")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: req)
        guard let http = response as? HTTPURLResponse else { throw GatewayClientError.invalidResponse }
        guard http.statusCode == 200 else { throw GatewayClientError.httpStatus(http.statusCode) }
        guard http.mimeType?.lowercased() == "text/event-stream" else { throw GatewayClientError.invalidResponse }
        var parser = GatewaySSEDecoder()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard let frame = try parser.append(byte) else { continue }
            if frame.event == "reconnect" || frame.event == "error" { throw GatewayClientError.transport }
            if frame.event == "update" {
                let update = try JSONDecoder().decode(GatewayLiveUpdate.self, from: frame.data)
                guard update.snapshot.sessionID == id else { throw GatewayClientError.invalidResponse }
                try await onUpdate(update)
            }
        }
        throw GatewayClientError.transport // EOF is never a successful turn/action.
    }
    #endif

    private func validatedID(_ id: String) throws -> String {
        guard id.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", options: .regularExpression) != nil else { throw GatewayClientError.invalidConnection }
        return id
    }
    private func request<T: Decodable>(_ path: String, method: String = "GET", data: Data? = nil) async throws -> T {
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var url = URLComponents(url: connection.url.appendingPathComponent(parts[0]), resolvingAgainstBaseURL: false)!
        if parts.count == 2 { url.percentEncodedQuery = parts[1] }
        var req = URLRequest(url: url.url!, timeoutInterval: 35)
        req.httpMethod = method; req.httpBody = data
        req.setValue("Bearer " + connection.token, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let result: (Data, URLResponse)
        do { result = try await session.data(for: req) }
        catch { if Task.isCancelled { throw CancellationError() }; throw GatewayClientError.transport }
        guard let response = result.1 as? HTTPURLResponse else { throw GatewayClientError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else { throw GatewayClientError.httpStatus(response.statusCode) }
        guard result.0.count <= 1_048_576 else { throw GatewayClientError.invalidResponse }
        do { return try JSONDecoder().decode(T.self, from: result.0) }
        catch { throw GatewayClientError.invalidResponse }
    }
}
private final class RejectGatewayRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
