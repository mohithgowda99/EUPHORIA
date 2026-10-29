import XCTest
import SwiftData
import Foundation
@testable import Euphoria

/// Wire-level source API tests. Uses original OpenBot/Hono contracts, NOT
/// evidence of a deployed account or a real Agents API execution.
final class SourceOpenDuetTests: XCTestCase, @unchecked Sendable {
    private let botJSON = #"{"id":"bot1","name":"Planner","title":"Organizes work","roleDescription":"Work safely","visibility":"private","mine":true,"canManage":true,"systemOwned":false,"hidden":false,"pinned":false,"hasAuth":false,"hasCallbackToken":false,"endpoint":null}"#

    func testCompletedNativeChoiceIsAReceiptBeforeTheReply() throws {
        let json = #"""
        {"afterMessageID":"source_user","selectedLabel":"Leg day",
         "surface":{"schemaVersion":1,"surfaceID":"call_legs","revision":0,
         "nodes":[{"id":"day","kind":"askChoice","title":"Choose workout",
         "options":[{"id":"pull","label":"Pull day"},{"id":"legs","label":"Leg day"}]}]}}
        """#
        let receipt = try JSONDecoder().decode(SourceCompletedVisual.self, from: Data(json.utf8))
        XCTAssertEqual(receipt.afterMessageID, "source_user")
        XCTAssertEqual(receipt.selectedLabel, "Leg day")
        let legacyJSON = json.replacingOccurrences(of: #""selectedLabel":"Leg day","#, with: "")
        let legacy = try JSONDecoder().decode(SourceCompletedVisual.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(legacy.selectedLabel, "Old saved surfaces stay readable without fabricated selections")
    }

    func testExpoStateCookieTransferMatchesOriginalBetterAuthNativeProxy() throws {
        XCTAssertEqual(SourceOAuthStateCookie.extract(
            from: "better-auth.oauth_state=source-123; Path=/; HttpOnly; SameSite=Lax"),
            "source-123")
        XCTAssertEqual(SourceOAuthStateCookie.extract(
            from: "other=1; Path=/, __Secure-better-auth.oauth_state=secure-state456; Secure"),
            "secure-state456")
        XCTAssertNil(SourceOAuthStateCookie.extract(from: "other.oauth_state=wrong; Secure"))
        XCTAssertNil(SourceOAuthStateCookie.extract(from: nil))
    }

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

    func testEditingRemoteBotPreservesOriginalEndpointAndVisibility() async throws {
        let remote = botJSON
            .replacingOccurrences(of: #""visibility":"private""#, with: #""visibility":"public""#)
            .replacingOccurrences(of: #""endpoint":null"#, with: #""endpoint":"https://managed.example/agent""#)
        let box = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            box.record(req)
            return (200, Data("{\"agent\":\(remote)}".utf8))
        }
        let api = try client()
        let current = try await api.bot(id: "bot1")
        let change = try SourceBotChange(previous: current, name: "Planner",
            title: "Better organizer", instructions: "Updated instructions")
        _ = try await api.updateBot(id: "bot1", input: change)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(
            with: XCTUnwrap(box.last?.httpBody)) as? [String: String])
        XCTAssertEqual(sent["visibility"], "public")
        XCTAssertEqual(sent["endpoint"], "https://managed.example/agent")
        XCTAssertEqual(sent["roleDescription"], "Updated instructions")
        XCTAssertEqual(box.last?.url?.path, "/api/agents/bot1")
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
        let sourceMemories = try await api.memories()
        XCTAssertEqual(sourceMemories.first?.content, "Prefer detailed briefs")
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

    func testOriginalTaskStoreCreationAndReplyNeverUseProviderSessionIDs() async throws {
        let task = #"{"id":"source_task","botId":"bot1","channelId":"source_channel","title":"Prepare analysis","why":null,"status":"working","next":null,"failure":null,"resolvedAt":null,"createdAt":"2026-10-28T00:00:00Z","updatedAt":"2026-10-28T00:00:00Z"}"#
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            switch (req.httpMethod, req.url?.path) {
            case ("GET", "/api/openduet/tasks"):
                return (200, Data("{\"tasks\":[\(task)]}".utf8))
            case ("POST", "/api/openduet/tasks"):
                return (201, Data("{\"task\":\(task)}".utf8))
            case ("POST", "/api/openduet/tasks/source_task/reply"):
                return (202, Data("{\"task\":\(task)}".utf8))
            default:
                return (404, Data("{}".utf8))
            }
        }
        let source = try client()
        let first = try await source.sourceTasks()
        XCTAssertEqual(first.first?.channelId, "source_channel")
        let created = try await source.createSourceTask(botID: "bot1", title: "Prepare analysis",
            instruction: "Prepare a safe analysis")
        XCTAssertEqual(created.id, "source_task")
        let creationBody = try XCTUnwrap(JSONSerialization.jsonObject(
            with: XCTUnwrap(observed.last?.httpBody)) as? [String:String])
        XCTAssertEqual(creationBody, ["botId":"bot1","title":"Prepare analysis",
                                       "instruction":"Prepare a safe analysis"])
        let id = "b2f04541-d95f-4852-9a13-87ee4bc1a1cb"
        let replied = try await source.sourceTaskReply(id: "source_task", message: "Continue", messageID: id)
        XCTAssertEqual(replied.id, "source_task")
        XCTAssertEqual(observed.last?.url?.path, "/api/openduet/tasks/source_task/reply")
        let replyBody = try XCTUnwrap(JSONSerialization.jsonObject(
            with: XCTUnwrap(observed.last?.httpBody)) as? [String:String])
        XCTAssertEqual(replyBody, ["reply":"Continue","messageId":id])
        // Crucially original source request has NO provider sessionID and
        // NO alternate task-execution or journal contract.
    }

    func testOriginalSkillGrantsStayScopedToBotAndNeverBecomeManagedMCPPermission() async throws {
        let observed = SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            if req.httpMethod == "POST" || req.httpMethod == "DELETE" {
                return (200, Data(#"{"ok":true}"#.utf8))
            }
            if req.url?.path == "/api/plugins" {
                return (200, Data(#"{"skills":[{"slug":"research","title":"Research","summary":"Use read-only sources"}]}"#.utf8))
            }
            return (200, Data(#"{"tools":[],"skills":[]}"#.utf8))
        }
        let api = try client()
        let skills = try await api.sourceSkills()
        XCTAssertEqual(skills.first?.slug, "research")
        _ = try await api.sourceBotGrants(botID: "bot1")
        XCTAssertEqual(observed.last?.url?.path, "/api/plugins/for/bot1")
        try await api.setSourceSkillGrant(botID: "bot1", slug: "research", enabled: true)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: XCTUnwrap(observed.last?.httpBody)) as? [String:String])
        XCTAssertEqual(payload, ["kind":"skill","ref":"research","agentId":"bot1"])
        try await api.setSourceSkillGrant(botID: "bot1", slug: "research", enabled: false)
        XCTAssertEqual(observed.last?.url?.path, "/api/plugins/grants")
        XCTAssertEqual(observed.last?.url?.query, "kind=skill&ref=research&agentId=bot1")
        XCTAssertNil(observed.last?.httpBody)
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

    func testManagedSourceVisualUsesCanonicalNativeContract() async throws {
        SourceTestProtocol.box.set { req in
            XCTAssertEqual(req.url?.path, "/api/delivery/conversations/channel1/visual")
            return (200, Data(#"{"surface":{"schemaVersion":1,"surfaceID":"call_native","revision":0,"nodes":[{"id":"choice","kind":"askChoice","title":"Choose","options":[{"id":"pull","label":"Pull day"}]}]}}"#.utf8))
        }
        let visual = try await client().sourceVisual(channelID: "channel1", agentID: "bot1")
        let surface = try XCTUnwrap(visual.surface)
        XCTAssertEqual(surface.surfaceID, "call_native")
        XCTAssertNoThrow(try surface.validate())
    }

    func testSignOutRevokesOwnedPushRegistrationBeforeForgettingCredentials() async throws {
        let api=try client(),deviceID=UUID(),cookie="better-auth.session_token=test"
        let probe=SourceForgetProbe(),observed=SourceRequestBox()
        SourceTestProtocol.box.set { req in
            observed.record(req)
            XCTAssertTrue(probe.origins.isEmpty,"Credentials must still be available during authenticated revocation")
            return (200,Data("{}".utf8))
        }
        try await SavedOpenDuetAccount.forget(client:api,deviceID:deviceID,clearCredentials:probe.record)
        XCTAssertEqual(observed.last?.httpMethod,"DELETE")
        XCTAssertEqual(observed.last?.url?.path,"/api/delivery/devices/"+deviceID.uuidString.lowercased())
        XCTAssertEqual(observed.last?.value(forHTTPHeaderField:"Cookie"),cookie)
        XCTAssertEqual(probe.origins,[api.endpoint.baseURL])
    }
    func testOfflineSignOutPreservesCredentialsAndDoesNotClaimRevocation() async throws {
        let api=try client(),probe=SourceForgetProbe()
        SourceTestProtocol.box.set {_ in (503,Data("{}".utf8))}
        do {try await SavedOpenDuetAccount.forget(client:api,deviceID:UUID(),clearCredentials:probe.record);XCTFail("Unconfirmed device revocation must not silently sign out")}
        catch {XCTAssertTrue(probe.origins.isEmpty)}
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

private final class SourceForgetProbe: @unchecked Sendable {
    private let lock=NSLock()
    private var values:[URL]=[]
    var origins:[URL] {lock.lock();defer {lock.unlock()};return values}
    func record(_ origin:URL) {lock.lock();defer {lock.unlock()};values.append(origin)}
}
