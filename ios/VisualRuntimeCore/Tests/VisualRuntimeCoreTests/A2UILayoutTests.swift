import XCTest
@testable import VisualRuntimeCore

final class A2UILayoutTests: XCTestCase {
    private func fixture() throws -> A2UIDocument {
        let url=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources/VisualRuntimeCore/Fixtures/a2ui-layout-v09.json")
        return try JSONDecoder().decode(A2UIDocument.self,from:Data(contentsOf:url))
    }
    func testBoundedLayoutsRoundTripWithDynamicTabTitlesAndPreservesModalEvent() throws {
        let document=try fixture()
        let restored=try JSONDecoder().decode(A2UIDocument.self,from:JSONEncoder().encode(document))
        XCTAssertEqual(restored,document)
        XCTAssertEqual(try restored.value(id:"heading",property:"text"),.string("Research brief"))
        let surface=try VisualSurface(surfaceID:document.surfaceId,revision:0,nodes:[VisualNode(id:"composition",kind:.sourceComposition,title:"Research",composition:document)],schemaVersion:2)
        XCTAssertFalse(VisualState(surface:surface).requiresDisplayReceipt)
        XCTAssertEqual(try restored.makeEvent(buttonID:"open",timestamp:"2026-10-29T00:00:00Z",idempotencyKey:"inspect_1").name,"inspect_evidence")
    }
    func testInvalidLayoutEnumsAndDuplicateOrCyclicRelationsFailClosed() throws {
        let document=try fixture()
        for (id,key,value) in [("root","align",A2UIValue.string("left")),("root","justify",.string("space-between")),("list","direction",.string("diagonal")),("rule","axis",.string("depth")),("tabs","tabs",.array([])),("modal","content",.string("root")),("icon","name",.object(["svg":.string("arbitrary")]))] {
            var nodes=document.components
            let i=try XCTUnwrap(nodes.firstIndex(where:{$0.id==id}))
            var props=nodes[i].properties; props[key]=value
            nodes[i]=A2UIComponent(id:id,component:nodes[i].component,properties:props)
            XCTAssertThrowsError(try A2UIDocument(surfaceId:document.surfaceId,catalogId:document.catalogId,components:nodes,dataModel:document.dataModel))
        }
    }
}
