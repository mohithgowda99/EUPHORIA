import XCTest
@testable import VisualRuntimeCore

final class LiveUpdateTests: XCTestCase {
    func testBoundedSSEHandlesCRLFMultilineAndSplitUnicode() throws {
        var parser = GatewaySSEDecoder(maxBytes: 1000)
        let wire = ": hello\r\nevent: update\r\ndata: {\"text\":\"é\",\r\ndata: \"count\":2}\r\n\r\n"
        var frames: [GatewaySSEFrame] = []
        for byte in wire.utf8 { if let frame = try parser.append(byte) { frames.append(frame) } }
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(frames[0].event, "update")
        XCTAssertEqual(String(data: frames[0].data, encoding: .utf8), "{\"text\":\"é\",\n\"count\":2}")
        var small = GatewaySSEDecoder(maxBytes: 10)
        XCTAssertThrowsError(try Array("data: too much content".utf8).forEach { _ = try small.append($0) })
    }
    func testLiveUpdateRequiresMatchingSessionAndPublishedSnapshot() throws {
        func wire(_ id: String, publication: Int?) throws -> Data {
            var snapshot: [String: Any] = ["sessionID":"sess_test","phase":"idle","surface":NSNull(),"acknowledgedActionIDs":[],"resolvedNodeIDs":[]]
            snapshot["publication"] = publication
            return try JSONSerialization.data(withJSONObject:["snapshot":snapshot,"history":["sessionID":id,"entries":[],"hasMore":false],"inputs":["operations":[]]])
        }
        XCTAssertNoThrow(try JSONDecoder().decode(GatewayLiveUpdate.self, from: wire("sess_test", publication: 1)))
        XCTAssertThrowsError(try JSONDecoder().decode(GatewayLiveUpdate.self, from: wire("sess_other", publication: 1)))
        XCTAssertThrowsError(try JSONDecoder().decode(GatewayLiveUpdate.self, from: wire("sess_test", publication: nil)))
    }
    func testLatestMergePreservesLoadedPaginationFrontier() throws {
        func page(_ id: String, _ cursor: String) throws -> GatewayHistoryPage {
            try JSONDecoder().decode(GatewayHistoryPage.self, from: JSONSerialization.data(withJSONObject:["sessionID":"sess_test","entries":[["id":id,"kind":"message","role":"assistant","status":"completed","text":id]],"hasMore":true,"nextCursor":cursor,"order":"desc"]))
        }
        var archive = ConversationArchive(sessionID: "sess_test")
        try archive.apply(page("new", "page2"), reset: true)
        try archive.apply(page("older", "page3"), reset: false)
        try archive.mergeLatest(page("new", "page2"))
        XCTAssertEqual(archive.nextCursor, "page3")
        try archive.apply(page("oldest", "page4"), reset: false)
        XCTAssertEqual(archive.entries.map(\.id), ["oldest", "older", "new"])
    }
    func testCompletedHistoryCannotRegressWhenAnOlderPartialReadArrives() throws {
        func page(_ status: String, _ text: String) throws -> GatewayHistoryPage {
            try JSONDecoder().decode(GatewayHistoryPage.self, from: JSONSerialization.data(withJSONObject:["sessionID":"sess_test","entries":[["id":"item_1","kind":"message","role":"assistant","status":status,"text":text]],"hasMore":false,"order":"desc"]))
        }
        var archive = ConversationArchive(sessionID:"sess_test")
        try archive.apply(page("completed","Final result"), reset:true)
        try archive.apply(page("in_progress","Partial"), reset:true)
        XCTAssertEqual(archive.entries[0].text,"Final result")
        XCTAssertEqual(archive.entries[0].status,"completed")
    }
}
