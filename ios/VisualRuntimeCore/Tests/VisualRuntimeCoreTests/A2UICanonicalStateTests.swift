import XCTest
@testable import VisualRuntimeCore

final class A2UICanonicalStateTests: XCTestCase {
    func testSharedDraftAndPendingEventUseExistingCanonicalSnapshot() throws {
        var state = VisualState(surface: try SourceFixtures.compositionSurface())
        let id = state.surface.surfaceID, revision = state.surface.revision
        try state.apply(VisualAction(id:"edit",surfaceID:id,expectedRevision:revision,nodeID:"composition",kind:.setField,values:["component":.text("field"),"value":.text("Kyoto")]))
        XCTAssertEqual(try state.compositionDocument(nodeID:"composition").value(id:"mirror",property:"text"),.string("Kyoto"))
        XCTAssertEqual(state.values.count,1); XCTAssertTrue(state.pending.isEmpty)
        let values = try state.compositionSubmissionValues(nodeID:"composition",buttonID:"submit")
        XCTAssertEqual(values["context:destination"],.text("Kyoto"))
        try state.apply(VisualAction(id:"event-once",surfaceID:id,expectedRevision:revision,nodeID:"composition",kind:.submitForm,values:values))
        let restored = try JSONDecoder().decode(VisualState.self,from:JSONEncoder().encode(state))
        XCTAssertEqual(restored.pending.map(\.id),["event-once"])
        XCTAssertEqual(try restored.compositionDocument(nodeID:"composition").value(id:"title",property:"text"),.string("Kyoto"))
        XCTAssertThrowsError(try state.apply(VisualAction(id:"locked",surfaceID:id,expectedRevision:revision,nodeID:"composition",kind:.setField,values:["component":.text("field"),"value":.text("Oslo")])))
    }
    func testForgedEventAndStaleRevisionAreRefusedAndNewRevisionDropsOldScopedDraft() throws {
        var state = VisualState(surface: try SourceFixtures.compositionSurface())
        let original = state.surface
        try state.apply(VisualAction(id:"edit",surfaceID:original.surfaceID,expectedRevision:original.revision,nodeID:"composition",kind:.setField,values:["component":.text("field"),"value":.text("Kyoto")]))
        var values = try state.compositionSubmissionValues(nodeID:"composition",buttonID:"submit")
        values["context:destination"] = .text("Forged")
        XCTAssertThrowsError(try state.apply(VisualAction(id:"forged",surfaceID:original.surfaceID,expectedRevision:original.revision,nodeID:"composition",kind:.submitForm,values:values)))
        XCTAssertThrowsError(try state.apply(VisualAction(id:"stale",surfaceID:original.surfaceID,expectedRevision:original.revision-1,nodeID:"composition",kind:.setField,values:["component":.text("field"),"value":.text("Oslo")])))
        let next = try VisualSurface(surfaceID:original.surfaceID,revision:original.revision+1,nodes:original.nodes,schemaVersion:2)
        try state.reconcile(next,acknowledgedActionIDs:[])
        XCTAssertEqual(try state.compositionDocument(nodeID:"composition").value(id:"title",property:"text"),.string("Paris"))
    }
    func testNodeIdentityCannotCollideWithCompositionDraftNamespace() throws {
        let original=try SourceFixtures.compositionSurface()
        let collision=VisualNode(id:"composition.source@4:/trip/destination",kind:.askChoice,title:"Collision",options:[VisualOption(id:"one",label:"One")])
        XCTAssertThrowsError(try VisualSurface(surfaceID:original.surfaceID,revision:original.revision,nodes:original.nodes+[collision],schemaVersion:2))
    }
}
