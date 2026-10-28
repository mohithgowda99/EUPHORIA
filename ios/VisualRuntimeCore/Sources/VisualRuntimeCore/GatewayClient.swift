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
    public let surface: VisualSurface?
    public let acknowledgedActionIDs: Set<String>
    public let rejectedActionIDs: Set<String>
    public let verificationMode: String
    public let resolvedNodeIDs: Set<String>
    private enum CodingKeys: String, CodingKey { case sessionID, phase, surface, acknowledgedActionIDs, resolvedNodeIDs, rejectedActionIDs, verificationMode }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionID = try c.decodeIfPresent(String.self, forKey: .sessionID)
        phase = try c.decode(String.self, forKey: .phase)
        verificationMode = try c.decodeIfPresent(String.self, forKey: .verificationMode) ?? "unverified"
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
    private func validatedID(_ id: String) throws -> String {
        guard id.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", options: .regularExpression) != nil else { throw GatewayClientError.invalidConnection }
        return id
    }
    private func request(_ path: String, method: String = "GET", data: Data? = nil) async throws -> GatewayEnvelope {
        var req = URLRequest(url: connection.url.appendingPathComponent(path), timeoutInterval: 35)
        req.httpMethod = method; req.httpBody = data
        req.setValue("Bearer " + connection.token, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let result: (Data, URLResponse)
        do { result = try await session.data(for: req) }
        catch { if Task.isCancelled { throw CancellationError() }; throw GatewayClientError.transport }
        guard let response = result.1 as? HTTPURLResponse else { throw GatewayClientError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else { throw GatewayClientError.httpStatus(response.statusCode) }
        guard result.0.count <= 1_048_576 else { throw GatewayClientError.invalidResponse }
        do { return try JSONDecoder().decode(GatewayEnvelope.self, from: result.0) }
        catch { throw GatewayClientError.invalidResponse }
    }
}
private final class RejectGatewayRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
