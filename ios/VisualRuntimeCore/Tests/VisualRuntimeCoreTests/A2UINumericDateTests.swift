import XCTest
@testable import VisualRuntimeCore

final class A2UINumericDateTests: XCTestCase {
    private func fixture() throws -> A2UIDocument {
        let url=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources/VisualRuntimeCore/Fixtures/a2ui-numeric-date-v09.json")
        return try JSONDecoder().decode(A2UIDocument.self,from:Data(contentsOf:url))
    }
    func testNativeStatePersistsNumericDateDraftAndQueuesOnlyCanonicalSubmission() throws {
        let d=try fixture()
        var state=VisualState(surface:try VisualSurface(surfaceID:d.surfaceId,revision:0,nodes:[VisualNode(id:"composition",kind:.sourceComposition,title:"Decision",composition:d)],schemaVersion:2))
        for (id,value) in [("confidence",VisualScalar.number(75)),("date",.text("2026-11-02T08:00:00Z"))] {
            try state.apply(VisualAction(id:"edit_"+id,surfaceID:d.surfaceId,expectedRevision:0,nodeID:"composition",kind:.setField,values:["component":.text(id),"value":value]))
        }
        let values=try state.compositionSubmissionValues(nodeID:"composition",buttonID:"submit")
        XCTAssertEqual(values["context:confidence"],.number(75))
        try state.apply(VisualAction(id:"submit",surfaceID:d.surfaceId,expectedRevision:0,nodeID:"composition",kind:.submitForm,values:values))
        let restored=try JSONDecoder().decode(VisualState.self,from:JSONEncoder().encode(state))
        XCTAssertEqual(restored.pending.count,1)
        XCTAssertEqual(restored.pending[0].values,values)
    }
    func testNumericAndDateEditsRestoreAndSubmitCanonicalValues() throws {
        var d=try fixture()
        _=try d.edit(componentID:"confidence",value:.number(75))
        _=try d.edit(componentID:"date",value:.string("2026-11-02T08:00:00Z"))
        let restored=try JSONDecoder().decode(A2UIDocument.self,from:JSONEncoder().encode(d))
        let event=try restored.makeEvent(buttonID:"submit",timestamp:"2026-10-29T00:00:00Z",idempotencyKey:"decision_1")
        XCTAssertEqual(event.context,["confidence":.number(75),"date":.string("2026-11-02T08:00:00Z")])
        let before=d
        for value in [A2UIValue.number(101),.number(-1),.number(.infinity),.string("75")] {XCTAssertThrowsError(try d.edit(componentID:"confidence",value:value));XCTAssertEqual(d,before)}
        for value in ["tomorrow","2026-11-31T08:00:00Z","2027-01-01T00:00:00Z"] {XCTAssertThrowsError(try d.edit(componentID:"date",value:.string(value)));XCTAssertEqual(d,before)}
    }
}
