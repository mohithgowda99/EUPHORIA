import XCTest
@testable import VisualRuntimeCore

final class A2UIReadOnlyTests: XCTestCase {
    func testReadOnlyCompositionQueuesDisplayReceiptAndRestoresWithoutInventingDecision() throws {
        let document=try A2UIDocument(surfaceId:"research",
            catalogId:"https://a2ui.org/specification/v0_9/basic_catalog.json",
            components:[A2UIComponent(id:"root",component:"Text",properties:["text":.string("A research result")])])
        let surface=try VisualSurface(surfaceID:"research",revision:0,
            nodes:[VisualNode(id:"composition",kind:.sourceComposition,title:"Research",composition:document)],schemaVersion:2)
        var state=VisualState(surface:surface)
        XCTAssertTrue(state.requiresDisplayReceipt)
        let action=VisualAction(id:"shown_1",surfaceID:"research",expectedRevision:0,
            nodeID:"composition",kind:.displayed,values:[:])
        try state.apply(action)
        let restored=try JSONDecoder().decode(VisualState.self,from:JSONEncoder().encode(state))
        XCTAssertEqual(restored.pending,[action])
        try state.reconcile(surface,acknowledgedActionIDs:[action.id],displayAcknowledged:true)
        XCTAssertFalse(state.requiresDisplayReceipt)
        XCTAssertTrue(state.pending.isEmpty)
    }
    func testInteractiveCompositionCannotUseDisplayReceiptToBypassItsDecision() throws {
        var state=VisualState(surface:try SourceFixtures.compositionSurface())
        XCTAssertFalse(state.requiresDisplayReceipt)
        XCTAssertThrowsError(try state.apply(VisualAction(id:"shown_1",surfaceID:state.surface.surfaceID,
            expectedRevision:state.surface.revision,nodeID:"composition",kind:.displayed,values:[:])))
    }
}
