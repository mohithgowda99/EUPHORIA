import XCTest
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import VisualRuntimeCore

final class GatewayClientTests: XCTestCase, @unchecked Sendable {
    func testPagedRosterAndSafeFailureDecoding() throws {
        let wire = #"{"sessions":[{"sessionID":"sess_test","phase":"render_failed","surface":null,"acknowledgedActionIDs":[],"resolvedNodeIDs":[],"failure":{"kind":"not_sent","stage":"pending_lookup","status":503}}],"hasMore":true,"nextCursor":"sess_test"}"#
        let page = try JSONDecoder().decode(GatewaySessionList.self, from: Data(wire.utf8))
        XCTAssertTrue(page.hasMore); XCTAssertEqual(page.nextCursor, "sess_test")
        XCTAssertEqual(page.sessions[0].failure?.kind, "not_sent")
        for bad in [wire.replacingOccurrences(of: "pending_lookup", with: "private-text"), wire.replacingOccurrences(of: "503", with: "999"), wire.replacingOccurrences(of: "\"nextCursor\":\"sess_test\"", with: "\"nextCursor\":null")] {
            XCTAssertThrowsError(try JSONDecoder().decode(GatewaySessionList.self, from: Data(bad.utf8)))
        }
        let legacy = try JSONDecoder().decode(GatewaySessionList.self, from: Data(#"{"sessions":[]}"#.utf8))
        XCTAssertFalse(legacy.hasMore)
    }
    func testSessionRosterUsesValidatedCursor() async throws {
        let box = RequestBox()
        GatewayTestProtocol.box.set { req in box.record(req); return (200, Data(#"{"sessions":[],"hasMore":false,"nextCursor":null}"#.utf8)) }
        _ = try await client().listSessions(after: "sess_before")
        XCTAssertEqual(box.last?.url?.query, "limit=50&after=sess_before")
        do { _ = try await client().listSessions(after: "../other"); XCTFail("Invalid cursor sent") } catch { }
    }
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

    func testFollowupUsesSameSessionAndHistoryUsesCursor() async throws {
        let box = RequestBox()
        GatewayTestProtocol.box.set { req in box.record(req); return (202, Data(#"{"id":"followup","phase":"accepted"}"#.utf8)) }
        let receipt = try await client().sendMessage(sessionID: "sess_test", message: "Continue", id: "followup")
        XCTAssertEqual(receipt.phase, "accepted")
        XCTAssertEqual(box.last?.url?.path, "/v1/sessions/sess_test/messages")
        GatewayTestProtocol.box.set { req in box.record(req); return (200, Data(#"{"sessionID":"sess_test","entries":[],"hasMore":false,"nextCursor":null}"#.utf8)) }
        _ = try await client().history(sessionID: "sess_test", after: "item_previous")
        XCTAssertEqual(box.last?.url?.query, "limit=10&after=item_previous")
    }
    func testRealTaskServiceIdentityAndPaginationNeverUseSessionAsTaskID() async throws {
        // Matches docs/contracts/fixtures/tasks-v1.json. The task ID is distinct
        // from the provider session ID, unlike the old WorkListView session roster.
        let task = #""id":"synthetic-task","title":"Plan the visit","instruction":"Prepare a visit plan","sessionID":"synthetic-session","status":"ready_for_review","resolvedAt":null,"createdAt":"2026-10-28T00:00:00Z","updatedAt":"2026-10-28T00:00:00Z","deliveryPhase":"accepted","pendingNodeIDs":[],"failure":null"#
        let page = #"{"tasks":[{\#(task)}],"hasMore":true,"nextCursor":"synthetic-task"}"#
        let box = RequestBox()
        GatewayTestProtocol.box.set { req in box.record(req); return (200, Data(page.utf8)) }
        let result = try await client().listTasks(after: "earlier_task")
        XCTAssertEqual(result.tasks.count, 1)
        XCTAssertEqual(result.tasks[0].id, "synthetic-task")
        XCTAssertEqual(result.tasks[0].sessionID, "synthetic-session")
        XCTAssertNotEqual(result.tasks[0].id, result.tasks[0].sessionID)
        XCTAssertEqual(box.last?.url?.path, "/v1/tasks")
        XCTAssertEqual(box.last?.url?.query, "limit=20&after=earlier_task")
        XCTAssertEqual(box.last?.value(forHTTPHeaderField: "Authorization"), "Bearer development-token")

        GatewayTestProtocol.box.set { req in
            box.record(req)
            return (200, Data(#"{"task":{\#(task)}}"#.utf8))
        }
        let detail = try await client().task(id: "synthetic-task")
        XCTAssertEqual(detail.task.id, "synthetic-task")
        XCTAssertEqual(box.last?.url?.path, "/v1/tasks/synthetic-task")
        do { _ = try await client().task(id: "../foreign"); XCTFail("Invalid task ID sent") }
        catch { }
    }

    func testRealTaskReportUsesSameOwnedTaskIdentityAndExistingHistoryWire() async throws {
        let item = #""id":"task_report","title":"Prepare report","instruction":"Summarize actual work","sessionID":"session_report","status":"ready_for_review","resolvedAt":null,"createdAt":"2026-10-28T00:00:00Z","updatedAt":"2026-10-28T00:00:00Z","deliveryPhase":"accepted","pendingNodeIDs":[],"failure":null"#
        let body = #"{"report":{"task":{\#(item)},"messages":[{"id":"message1","kind":"message","status":"completed","text":"Result saved","role":"assistant","turnID":"root1"}],"historyHasMore":false,"historyCursor":null,"decisions":[],"decisionsHasMore":false,"decisionsCursor":null}}"#
        let box = RequestBox()
        GatewayTestProtocol.box.set { req in
            box.record(req)
            return (200, Data(body.utf8))
        }
        let result = try await client().taskReport(id: "task_report")
        XCTAssertEqual(result.report.task.id, "task_report")
        XCTAssertEqual(result.report.messages.first?.text, "Result saved")
        XCTAssertEqual(box.last?.url?.path, "/v1/tasks/task_report/report")
        _ = try await client().taskReport(id: "task_report", after: "message1")
        XCTAssertEqual(box.last?.url?.query, "historyAfter=message1")
        do { _ = try await client().taskReport(id: "../foreign"); XCTFail("Invalid task ID sent") }
        catch { }
    }

    func testTaskServiceRejectsMalformedStatusesAndCursorBeforeRendering() throws {
        let item = #""id":"task_one","title":"Work","instruction":"Do real work","sessionID":"session_one","status":"working","resolvedAt":null,"createdAt":"2026-10-28T00:00:00Z","updatedAt":"2026-10-28T00:00:00Z","deliveryPhase":"accepted","pendingNodeIDs":[],"failure":null"#
        let good = #"{"tasks":[{\#(item)}],"hasMore":true,"nextCursor":"task_one"}"#
        XCTAssertNoThrow(try JSONDecoder().decode(GatewayTaskList.self, from: Data(good.utf8)))
        for bad in [
            good.replacingOccurrences(of: "task_one\"}", with: "foreign\"}"),
            good.replacingOccurrences(of: "\"working\"", with: "\"success\""),
            good.replacingOccurrences(of: "\"id\":\"task_one\"", with: "\"id\":\"../foreign\""),
            good.replacingOccurrences(of: "\"hasMore\":true", with: "\"hasMore\":false")
        ] {
            XCTAssertThrowsError(try JSONDecoder().decode(GatewayTaskList.self, from: Data(bad.utf8)))
        }
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
