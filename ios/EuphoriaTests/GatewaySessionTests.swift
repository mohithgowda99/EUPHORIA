import XCTest
import SwiftData
import Foundation
@testable import Euphoria

@MainActor
final class GatewaySessionTests: XCTestCase {
    func testStartingNewSessionDoesNotExposePreviousSurface() async throws {
        let (model, preferences, key, container) = try makeModel()
        _ = container
        defer { preferences.removePersistentDomain(forName: key) }
        SessionTestProtocol.responses.set([
            ("/v1/sessions/sess_old", try reply(session: "sess_old", phase: "waiting", surface: SourceFixtures.surface())),
            ("/v1/sessions", try reply(session: "sess_new", phase: "in_progress")),
            ("/v1/sessions/sess_new", try reply(session: "sess_new", phase: "in_progress")),
        ])
        await model.restore(); XCTAssertNotNil(model.state)
        await model.start(message: "A different task")
        XCTAssertNil(model.state, "A pending new session must not expose controls from the old session")
        XCTAssertEqual(model.phase, "in_progress")
    }
    func testUncertainCreationIsNotHiddenByRefreshingPreviousSession() async throws {
        let (model, preferences, key, container) = try makeModel()
        _ = container
        defer { preferences.removePersistentDomain(forName: key) }
        SessionTestProtocol.responses.set([
            ("/v1/sessions/sess_old", try reply(session: "sess_old", phase: "waiting", surface: SourceFixtures.surface())),
            ("/v1/sessions", try reply(session: nil, phase: "uncertain")),
            ("request", try reply(session: nil, phase: "uncertain")),
            ("/v1/sessions/sess_old", try reply(session: "sess_old", phase: "waiting", surface: SourceFixtures.surface())),
        ])
        await model.restore(); await model.start(message: "A task with a lost response")
        await model.refresh()
        XCTAssertEqual(model.phase, "uncertain")
        XCTAssertEqual(SessionTestProtocol.responses.paths.count, 3, "No old-session refresh should mask uncertain creation")
    }

    func testExplicitRecoveryCancelsAbsentCreationAndAllowsAnotherTask() async throws {
        let (model, preferences, key, container) = try makeModel()
        _ = container
        defer { preferences.removePersistentDomain(forName: key) }
        SessionTestProtocol.responses.set([
            ("/v1/sessions", try reply(session: nil, phase: "uncertain")),
            ("request", try reply(session: nil, phase: "cancelled")),
            ("/v1/sessions", try reply(session: "sess_new", phase: "in_progress")),
            ("/v1/sessions/sess_new", try reply(session: "sess_new", phase: "in_progress")),
        ])
        await model.start(message: "Not recorded")
        await model.resolvePending()
        await model.start(message: "A fresh request")
        XCTAssertEqual(SessionTestProtocol.responses.paths.count, 4)
        XCTAssertEqual(model.phase, "in_progress")
    }
    private func makeModel() throws -> (GatewaySessionModel, UserDefaults, String, ModelContainer) {
        let suite = "euphoria.tests." + UUID().uuidString
        let prefs = try XCTUnwrap(UserDefaults(suiteName: suite))
        prefs.set("sess_old", forKey: "euphoria.gateway.test.session")
        let container = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [SessionTestProtocol.self]
        let client = GatewayClient(connection: try GatewayConnection(url: "https://gateway.example", token: "test-token"),
            session: URLSession(configuration: config))
        return (GatewaySessionModel(client: client, context: ModelContext(container), storageKey: "test", preferences: prefs), prefs, suite, container)
    }
    private func reply(session: String?, phase: String, surface: VisualSurface? = nil) throws -> Data {
        var json: [String: Any] = ["sessionID": session as Any? ?? NSNull(), "phase": phase,
            "surface": NSNull(), "acknowledgedActionIDs": [], "resolvedNodeIDs": []]
        if let surface { json["surface"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(surface)) }
        return try JSONSerialization.data(withJSONObject: json)
    }
}
private final class SessionResponseQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var steps: [(String, Data)] = []
    private var seen: [String] = []
    var paths: [String] { lock.lock(); defer { lock.unlock() }; return seen }
    func set(_ steps: [(String, Data)]) { lock.lock(); defer { lock.unlock() }; self.steps = steps; seen = [] }
    func next(_ path: String) throws -> Data {
        lock.lock(); defer { lock.unlock() }; seen.append(path)
        guard !steps.isEmpty else { throw URLError(.badServerResponse) }
        let (expected, data) = steps.removeFirst()
        guard expected == path || (expected == "request" && path.hasPrefix("/v1/requests/")) else { throw URLError(.badServerResponse) }
        return data
    }
}
private final class SessionTestProtocol: URLProtocol, @unchecked Sendable {
    static let responses = SessionResponseQueue()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let data = try Self.responses.next(request.url!.path)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
