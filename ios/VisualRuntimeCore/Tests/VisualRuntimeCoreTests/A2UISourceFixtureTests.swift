import XCTest
@testable import VisualRuntimeCore

final class A2UISourceFixtureTests: XCTestCase {
    func testNestedLayoutFixturePreservesSharedBinding() throws {
        let doc = try load("a2ui-nested-trip-v09")
        XCTAssertEqual(try doc.value(id:"title",property:"text"),.string("Paris"))
        var edited=doc
        _ = try edited.edit(componentID:"field",value:.string("Kyoto"))
        XCTAssertEqual(try edited.value(id:"mirror",property:"text"),.string("Kyoto"))
        let action=try edited.makeEvent(buttonID:"submit",timestamp:"2026-10-28T11:00:00Z",idempotencyKey:"trip-fixture")
        XCTAssertEqual(action.context["destination"],.string("Kyoto"))
        XCTAssertEqual(action.context["source"],.string("native"))
    }
    func testDistinctChoiceFixtureRejectsMultipleSelections() throws {
        var doc=try load("a2ui-choice-deployment-v09")
        _=try doc.edit(componentID:"choice",value:.array([.string("prod")]))
        XCTAssertEqual(try doc.value(id:"choice",property:"value"),.array([.string("prod")]))
        XCTAssertThrowsError(try doc.edit(componentID:"choice",value:.array([.string("stage"),.string("prod")])))
        XCTAssertEqual(try JSONDecoder().decode(A2UIDocument.self,from:JSONEncoder().encode(doc)),doc)
    }
    private func load(_ name:String)throws->A2UIDocument {
        let path=try XCTUnwrap(Bundle.module.url(forResource:name,withExtension:"json"))
        let data=try Data(contentsOf:path)
        let result=try JSONDecoder().decode(A2UIDocument.self,from:data)
        try result.validate()
        return result
    }
}
