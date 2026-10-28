import XCTest
import SwiftData
import Foundation
@testable import Euphoria

/// Wire-level source API tests. Uses original OpenBot/Hono contracts, NOT
/// evidence of a deployed account or a real Agents API execution.
final class SourceOpenDuetTests: XCTestCase, @unchecked Sendable {
    private let botJSON = #"{"id":"bot1","name":"Planner","title":"Organizes work","roleDescription":"Work safely","visibility":"private","mine":true,"canManage":true,"systemOwned":false,"hidden":false,"pinned":false,"hasAuth":false,"hasCallbackToken":false,"endpoint":null}"#

    func testNativeCookieCallbackExtractsOnlyOriginalBetterAuthSession() throws {
        let callback = try XCTUnwrap(URL(string:
            "openbotmobile://?cookie=better-auth.session_token%3Dabc123%3B%20Path%3D%2F%3B%20HttpOnly"))
        XCTAssertEqual(try SourceSessionCookie.extract(from: callback), "better-auth.session_token=abc123")
        let secure = try XCTUnwrap(URL(string:
            "openbotmobile://?cookie=__Secure-better-auth.session_token%3Dsecret_456%3B%20Secure"))
        XCTAssertEqual(try SourceSessionCookie.extract(from: secure),
            "__Secure-better-auth.session_token=secret_456")
        for raw in [
            "https://evil.example/?cookie=better-auth.session_token%3Dabc",
            "openbotmobile://?cookie=other.session_token%3Dabc",
            "openbotmobile://?cookie=better-auth.session_data%3Dabc"
        ] {
            XCTAssertThrowsError(try SourceSessionCookie.extract(from: XCTUnwrap(URL(string: raw))))
        }
    }

    func testSourceRosterAndCreationUseAuthenticatedOriginalBotRoutes() async throws {
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            if req.httpMethod == "POST" {
                return (201, Data("{\"agent\":\(self.botJSON)}".utf8))
            }
            return (200, Data("{\"agents\":[\(self.botJSON)]}".utf8))
        }
        let api = try client()
        let results = try await api.bots()
        XCTAssertEqual(results.map(\.id), ["bot1"])
        XCTAssertEqual(observed.last?.url?.path, "/api/agents")
        XCTAssertEqual(observed.last?.value(forHTTPHeaderField: "Cookie"), "better-auth.session_token=test")
        let bot = try await api.createBot(SourceBotInput(name: "Planner", title: "Organizes work", instructions: "Work safely"))
        XCTAssertEqual(bot.id, "bot1")
        let body = try XCTUnwrap(observed.last?.httpBody)
        let input = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(input, ["name":"Planner","title":"Organizes work",
                               "roleDescription":"Work safely","visibility":"private"])
        XCTAssertEqual(observed.last?.httpMethod, "POST")
    }

    func testSourceBotMutationsAcceptActualHTTP204WithoutFakeBodies() async throws {
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in observed.record(req); return (204, Data()) }
        let api = try client()
        try await api.hideBot(id: "bot1", hidden: true)
        XCTAssertEqual(observed.last?.url?.path, "/api/agents/bot1/hide")
        try await api.pinBot(id: "bot1", pinned: true)
        XCTAssertEqual(observed.last?.url?.path, "/api/agents/bot1/pin")
        try await api.deleteBot(id: "bot1")
        XCTAssertEqual(observed.last?.url?.path, "/api/agents/bot1")
        XCTAssertThrowsError(try SourceBotInput(name: "", title: "t", instructions: "i"))
    }

    func testOriginalMemoryAndApprovalWritesNeverBypassAccountCookie() async throws {
        let memory = #"{"id":"mem1","content":"Prefer detailed briefs","provenance":"You","enabled":true,"reviewState":"confirmed","formedBy":"person"}"#
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            switch (req.httpMethod, req.url?.path) {
            case ("GET", "/api/memory"):
                return (200, Data("{\"memories\":[\(memory)]}".utf8))
            case ("PATCH", "/api/memory/mem1"):
                return (200, Data("{\"memory\":\(memory)}".utf8))
            case ("POST", "/api/approvals/approval1/decision"):
                return (200, Data(#"{"id":"approval1","status":"denied"}"#.utf8))
            case ("DELETE", "/api/memory/mem1"):
                return (204, Data())
            default:
                return (404, Data("{}".utf8))
            }
        }
        let api = try client()
        XCTAssertEqual(try await api.memories().first?.content, "Prefer detailed briefs")
        _ = try await api.setMemoryEnabled(id: "mem1", enabled: false)
        XCTAssertEqual(observed.last?.url?.path, "/api/memory/mem1")
        let result = try await api.refuseApproval(id: "approval1")
        XCTAssertEqual(result.id, "approval1")
        let body = try XCTUnwrap(observed.last?.httpBody)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: body) as? [String:String], ["decision":"deny"])
        try await api.deleteMemory(id: "mem1")
        XCTAssertEqual(observed.last?.value(forHTTPHeaderField: "Cookie"), "better-auth.session_token=test")
    }

    func testSourceNativeDeliveryPreservesExactExternalId() async throws {
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            return (202, Data(#"{"status":"queued"}"#.utf8))
        }
        let api = try client()
        let id = "a17e6189-484f-4cdc-b733-104286bc903c"
        try await api.sendSourceMessage(channelID: "channel1", botID: "bot1", text: "Do the work", externalID: id)
        XCTAssertEqual(observed.last?.url?.path, "/api/delivery/conversations/channel1/messages")
        let body = try XCTUnwrap(observed.last?.httpBody)
        let posted = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String:String])
        XCTAssertEqual(posted, ["agentId":"bot1","text":"Do the work","externalId":id])
        try await api.sendSourceMessage(channelID: "channel1", botID: "bot1", text: "Do the work", externalID: id)
        let same = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(observed.last?.httpBody)) as? [String:String])
        XCTAssertEqual(posted, same, "A recovery must use the exact original source delivery identity")
    }

    func testSocialSignInUsesOriginalSameOriginOAuthStateProxy() async throws {
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            return (200, Data(#"{"url":"https://accounts.google.com/o/oauth2/v2/auth?state=source_state","redirect":true}"#.utf8))
        }
        let api = try client()
        let url = try await api.socialAuthorizationURL(provider: "google")
        XCTAssertEqual(url.path, "/api/auth/expo-authorization-proxy")
        XCTAssertEqual(url.host, "original.example")
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "authorizationURL" })?.value)
        XCTAssertTrue(query.hasPrefix("https://accounts.google.com/"))
        let posted = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(observed.last?.httpBody)) as? [String: String])
        XCTAssertEqual(posted["callbackURL"], "openbotmobile://")
        XCTAssertThrowsError(try SourceSessionCookie.extract(from: url))
    }

    @MainActor
    func testSourceNativeDeliveryIntentSurvivesNewModelContext() throws {
        let container = try ModelContainer(for: SourceMessageIntent.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = ModelContext(container)
        let outgoing = SourceMessageIntent(ownerScope: "https://original.example:owner",
            channelID: "channel1", botID: "bot1", externalID: "one", message: "Hello")
        context.insert(outgoing)
        try context.save()
        let reopened = try ModelContext(container).fetch(FetchDescriptor<SourceMessageIntent>())
        XCTAssertEqual(reopened.count, 1)
        XCTAssertEqual(reopened.first?.externalID, "one")
    }

    private func client() throws -> OpenDuetSourceAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SourceTestProtocol.self]
        return OpenDuetSourceAPI(endpoint: try OpenBotEndpoint("https://original.example"),
            cookie: "better-auth.session_token=test", session: URLSession(configuration: config))
    }
}
private final class SourceRequestBox: @unchecked Sendable {
    private let lock = NSLock()
    private var lastRequest: URLRequest?
    var last: URLRequest? {
        lock.lock(); defer { lock.unlock() }
        return lastRequest
    }
    func record(_ req: URLRequest) {
        lock.lock(); defer { lock.unlock() }
        lastRequest = req
    }
}
private final class SourceHandlerBox: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: ((URLRequest) -> (Int, Data))?
    func set(_ next: @escaping (URLRequest) -> (Int, Data)) {
        lock.lock(); defer { lock.unlock() }; handler = next
    }
    func handle(_ req: URLRequest) -> (Int, Data) {
        lock.lock(); let h = handler; lock.unlock()
        return h?(req) ?? (500, Data())
    }
}
private final class SourceTestProtocol: URLProtocol, @unchecked Sendable {
    static let box = SourceHandlerBox()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var forwarded = request
        if forwarded.httpBody == nil, let stream = forwarded.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                bytes.append(buffer, count: n)
            }
            forwarded.httpBody = bytes
        }
        let (status, data) = Self.box.handle(forwarded)
        let reply = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: reply, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
