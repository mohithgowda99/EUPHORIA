import XCTest
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import VisualRuntimeCore

final class GatewayClientTests: XCTestCase, @unchecked Sendable {
    func testConnectionRequiresHTTPSExceptExplicitLoopbackDevelopment() throws {
        XCTAssertThrowsError(try GatewayConnection(url: "http://example.com", token: "token"))
        XCTAssertThrowsError(try GatewayConnection(url: "https://user:pass@example.com", token: "token"))
        XCTAssertThrowsError(try GatewayConnection(url: "https://example.com?secret=1", token: "token"))
        XCTAssertThrowsError(try GatewayConnection(url: "https://example.com", token: ""))
        XCTAssertNoThrow(try GatewayConnection(url: "http://127.0.0.1:8787", token: "token", allowLoopback: true))
    }
    func testNativeChoiceTransmitsBearerAndCanonicalAction() async throws {
        let action = VisualAction(id: "native-1", surfaceID: "surface_test", expectedRevision: 1,
            nodeID: "choice", kind: .choose, values: ["choice": .text("yes"), "label": .text("Yes")])
        let box = RequestBox()
        GatewayTestProtocol.box.set { request in
            box.record(request)
            return (202, Data(#"{"sessionID":"sess_test","phase":"accepted","surface":null,"acknowledgedActionIDs":["native-1"],"resolvedNodeIDs":[]}"#.utf8))
        }
        let reply = try await client().submit(action)
        XCTAssertEqual(reply.phase, "accepted")
        XCTAssertEqual(reply.acknowledgedActionIDs, ["native-1"])
        let request = try XCTUnwrap(box.last)
        XCTAssertEqual(request.url?.path, "/v1/surfaces/surface_test/actions")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer development-token")
        XCTAssertEqual(try JSONDecoder().decode(VisualAction.self, from: XCTUnwrap(request.httpBody)), action)
    }
    func testInvalidIncomingSurfaceNeverEntersNativeRenderer() async throws {
        GatewayTestProtocol.box.set { _ in (200, Data(#"{"sessionID":"sess_test","phase":"waiting","surface":{"schemaVersion":1,"surfaceID":"s","revision":1,"nodes":[]},"acknowledgedActionIDs":[],"resolvedNodeIDs":[]}"#.utf8)) }
        do { _ = try await client().refresh(sessionID: "sess_test"); XCTFail("Invalid surface accepted") }
        catch { XCTAssertEqual(error as? GatewayClientError, .invalidResponse) }
    }
    func testGatewayErrorDoesNotExposeResponseBody() async throws {
        GatewayTestProtocol.box.set { _ in (401, Data(#"{"error":"private prompt or token"}"#.utf8)) }
        do { _ = try await client().refresh(sessionID: "sess_test"); XCTFail("Expected rejection") }
        catch { XCTAssertEqual(error as? GatewayClientError, .httpStatus(401)) }
    }
    func testCreateKeepsCallerSubmissionIdentityAndOriginalMessage() async throws {
        let box = RequestBox()
        GatewayTestProtocol.box.set { req in
            box.record(req)
            return (201, Data(#"{"sessionID":"sess_test","phase":"in_progress","surface":null,"acknowledgedActionIDs":[],"resolvedNodeIDs":[]}"#.utf8))
        }
        _ = try await client().create(message: "Plan my day", requestID: "create_native")
        let request = try XCTUnwrap(box.last)
        XCTAssertEqual(request.url?.path, "/v1/sessions")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String])
        XCTAssertEqual(body, ["id": "create_native", "message": "Plan my day"])
    }
    private func client() throws -> GatewayClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [GatewayTestProtocol.self]
        return GatewayClient(connection: try GatewayConnection(url: "https://gateway.example", token: "development-token"),
            session: URLSession(configuration: config))
    }
}

private final class RequestBox: @unchecked Sendable {
    private let lock = NSLock()
    private var request: URLRequest?
    var last: URLRequest? { lock.lock(); defer { lock.unlock() }; return request }
    func record(_ req: URLRequest) { lock.lock(); defer { lock.unlock() }; request = req }
}
private final class HandlerBox: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: ((URLRequest) throws -> (Int, Data))?
    func set(_ value: @escaping (URLRequest) throws -> (Int, Data)) { lock.lock(); defer { lock.unlock() }; handler = value }
    func run(_ req: URLRequest) throws -> (Int, Data) { lock.lock(); let h = handler; lock.unlock(); return try h!(req) }
}
private final class GatewayTestProtocol: URLProtocol, @unchecked Sendable {
    static let box = HandlerBox()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var req = request
            if req.httpBody == nil, let stream = req.httpBodyStream {
                stream.open(); defer { stream.close() }
                var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
                req.httpBody = data
            }
            let (status, data) = try Self.box.run(req)
            let response = HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
