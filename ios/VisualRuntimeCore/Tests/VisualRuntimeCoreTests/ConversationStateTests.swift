import XCTest
@testable import VisualRuntimeCore

final class ConversationStateTests: XCTestCase {
    func testPendingMessagesSurviveCodingAndReconcileWithoutReplay() throws {
        var archive = ConversationArchive(sessionID: "sess_test")
        try archive.enqueue(GatewayInputIntent(id: "message-1", kind: .message, message: "Use the same session"))
        var restored = try JSONDecoder().decode(ConversationArchive.self, from: JSONEncoder().encode(archive))
        XCTAssertEqual(restored.operations[0].message, "Use the same session")
        try restored.reconcile([GatewayInputReceipt(id: "message-1", phase: "uncertain")])
        XCTAssertEqual(restored.pendingOperations.count, 1)
        try restored.reconcile([GatewayInputReceipt(id: "message-1", phase: "cancelled")])
        XCTAssertTrue(restored.pendingOperations.isEmpty)
        XCTAssertEqual(restored.entries.count, 0, "An input receipt is not an assistant message")
    }
    func testDuplicateInputAndForeignHistoryCannotCorruptConversation() throws {
        var archive = ConversationArchive(sessionID: "sess_test")
        let input = GatewayInputIntent(id: "same", kind: .cancel)
        try archive.enqueue(input)
        XCTAssertThrowsError(try archive.enqueue(input))
        let page = Data(#"{"sessionID":"sess_other","entries":[],"hasMore":false,"nextCursor":null}"#.utf8)
        XCTAssertThrowsError(try archive.apply(JSONDecoder().decode(GatewayHistoryPage.self, from: page), reset: true))
        XCTAssertEqual(archive.operations.count, 1)
    }
    func testPagedHistoryDeduplicatesUpdatesAndKeepsUnsupportedEntries() throws {
        var archive = ConversationArchive(sessionID: "sess_test")
        let first = Data(#"{"sessionID":"sess_test","entries":[{"id":"one","kind":"message","role":"assistant","status":"in_progress","text":"Working"}],"hasMore":true,"nextCursor":"one"}"#.utf8)
        let next = Data(#"{"sessionID":"sess_test","entries":[{"id":"one","kind":"message","role":"assistant","status":"completed","text":"Done"},{"id":"two","kind":"unsupported","status":"completed","text":"Unknown tool"}],"hasMore":false,"nextCursor":null}"#.utf8)
        try archive.apply(JSONDecoder().decode(GatewayHistoryPage.self, from: first), reset: true)
        try archive.apply(JSONDecoder().decode(GatewayHistoryPage.self, from: next), reset: false)
        XCTAssertEqual(archive.entries.map(\.id), ["one", "two"])
        XCTAssertEqual(archive.entries[0].text, "Done")
        XCTAssertTrue(archive.historyLoaded)
        XCTAssertFalse(archive.hasMore)
    }
    func testNewestWindowRefreshKeepsOlderPagesAndNewMessagesAfterReopen() throws {
        func page(_ ids: [Int]) throws -> GatewayHistoryPage {
            let entries = ids.map { ["id":"item_\($0)","kind":"message","role":"assistant","status":"completed","text":"Message \($0)"] }
            return try JSONDecoder().decode(GatewayHistoryPage.self, from: JSONSerialization.data(withJSONObject: [
                "sessionID":"sess_test","entries":entries,"hasMore":true,"nextCursor":"item_\(ids.first!)","order":"desc"]))
        }
        var archive = ConversationArchive(sessionID:"sess_test")
        try archive.apply(page(Array(10..<20)), reset:true)
        try archive.apply(page(Array(0..<10)), reset:false)
        XCTAssertEqual(archive.entries.first?.id,"item_0")
        archive = try JSONDecoder().decode(ConversationArchive.self, from: JSONEncoder().encode(archive))
        try archive.apply(page(Array(12..<22)), reset:true)
        XCTAssertEqual(archive.entries.count,22)
        XCTAssertEqual(archive.entries.first?.id,"item_0")
        XCTAssertEqual(archive.entries.last?.text,"Message 21")
        try archive.reconcile([GatewayInputReceipt(id:"other",phase:"rejected")])
        try archive.apply(page(Array(32..<42)), reset:true)
        try archive.apply(page(Array(22..<32)), reset:false)
        XCTAssertEqual(archive.entries.map(\.id), (0..<42).map { "item_\($0)" })

    }

}
