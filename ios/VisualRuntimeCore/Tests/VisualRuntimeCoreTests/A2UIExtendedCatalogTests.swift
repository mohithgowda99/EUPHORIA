import XCTest
@testable import VisualRuntimeCore

final class A2UIExtendedCatalogTests: XCTestCase {
    private let catalog = "https://a2ui.org/specification/v0_9/basic_catalog.json"
    private func node(_ id: String, _ kind: String, _ p: [String:A2UIValue] = [:]) -> A2UIComponent {
        A2UIComponent(id:id,component:kind,properties:p)
    }
    private func path(_ value:String)->A2UIValue { .object(["path":.string(value)]) }
    private func make(_ nodes:[A2UIComponent], model:A2UIValue = .object([:])) throws -> A2UIDocument {
        try A2UIDocument(surfaceId:"extended",catalogId:catalog,components:nodes,dataModel:model)
    }
    func testNestedStaticListWithIconsImageDividerAndMedia() throws {
        let doc = try make([
            node("root","List",["children":.array([.string("card"),.string("separator"),.string("media")]),"direction":.string("vertical")]),
            node("card","Card",["child":.string("row")]),
            node("row","Row",["children":.array([.string("icon"),.string("image")])]),
            node("icon","Icon",["name":.string("home")]),
            node("image","Image",["url":.string("https://example.org/photo.png"),"fit":.string("contain")]),
            node("separator","Divider",["axis":.string("horizontal")]),
            node("media","Column",["children":.array([.string("video"),.string("audio")])]),
            node("video","Video",["url":.string("https://example.org/clip.mp4")]),
            node("audio","AudioPlayer",["url":.string("https://example.org/audio.mp3"),"description":.string("Description")])
        ])
        XCTAssertEqual(doc.components.count, 9)
        XCTAssertEqual(try JSONDecoder().decode(A2UIDocument.self, from: JSONEncoder().encode(doc)), doc)
    }
    func testNestedTabsAndModalWithDistinctChildIdentity() throws {
        let doc=try make([
            node("root","Tabs",["tabs":.array([
                .object(["title":.string("Today"),"child":.string("today")]),
                .object(["title":.string("History"),"child":.string("modal")])
            ])]),
            node("today","Text",["text":.string("Today")]),
            node("modal","Modal",["trigger":.string("trigger"),"content":.string("detail")]),
            node("trigger","Text",["text":.string("Details")]),
            node("detail","Text",["text":.string("Historical record")])
        ])
        XCTAssertEqual(doc.components.map(\.id).count, 5)
    }
    func testBoundSliderClampsEditsAndPreservesUnrelatedSharedText() throws {
        var doc=try make([
            node("root","Column",["children":.array([.string("label"),.string("slider"),.string("mirror")])]),
            node("label","Text",["text":path("/settings/name")]),
            node("slider","Slider",["label":.string("Intensity"),"min":.number(0),"max":.number(10),"value":path("/settings/level")]),
            node("mirror","Text",["text":path("/settings/name")])
        ], model:.object(["settings":.object(["name":.string("Session"),"level":.number(3)])]))
        XCTAssertEqual(try doc.edit(componentID:"slider",value:.number(7)),"/settings/level")
        XCTAssertThrowsError(try doc.edit(componentID:"slider",value:.number(11)))
        try doc.updateDataModel(path:"/settings/name",value:.string("Edited"),revision:1)
        XCTAssertEqual(try doc.value(id:"label",property:"text"),.string("Edited"))
        XCTAssertEqual(try doc.value(id:"mirror",property:"text"),.string("Edited"))
        XCTAssertEqual(try doc.value(id:"slider",property:"value"),.number(7))
        XCTAssertEqual(try JSONDecoder().decode(A2UIDocument.self,from:JSONEncoder().encode(doc)).localEdits["/settings/level"],.number(7))
    }
    func testDateTimeBoundValueAndValidation() throws {
        var doc=try make([
            node("root","DateTimeInput",["value":path("/date"),"enableDate":.bool(true),"label":.string("Due")])
        ],model:.object(["date":.string("2026-10-28")]))
        XCTAssertEqual(try doc.edit(componentID:"root",value:.string("2026-11-05")),"/date")
        XCTAssertThrowsError(try doc.edit(componentID:"root",value:.string("next Tuesday")))
    }
    func testInvalidSourceShapesFailClosed() throws {
        XCTAssertThrowsError(try make([node("root","Image",["url":.string("http://localhost/private")])]))
        XCTAssertThrowsError(try make([node("root","Icon",["name":.object(["svgPath":.string("M0 0")])])]))
        XCTAssertThrowsError(try make([node("root","List",["children":.object(["path":.string("/items"),"componentId":.string("row")])]),node("row","Text",["text":.string("row")])]))
        XCTAssertThrowsError(try make([node("root","Tabs",["tabs":.array([.object(["title":.string("One"),"child":.string("missing")])])])]))
        XCTAssertThrowsError(try make([node("root","Slider",["max":.number(2),"value":.number(3)])]))
        XCTAssertThrowsError(try make([node("root","DateTimeInput",["value":.string("tomorrow"),"enableDate":.bool(true)])]))
        XCTAssertThrowsError(try make([node("root","Divider",["axis":.string("diagonal")])]))
    }
    func testRemoveAndRestoreExtendedGraph() throws {
        var doc=try make([
            node("root","Column",["children":.array([.string("slider"),.string("divider")])]),
            node("slider","Slider",["max":.number(100),"value":path("/amount")]),
            node("divider","Divider")
        ],model:.object(["amount":.number(25)]))
        _=try doc.edit(componentID:"slider",value:.number(40))
        try doc.updateComponents([
            node("root","List",["children":.array([.string("divider"),.string("slider")])]),
            node("slider","Slider",["max":.number(100),"value":path("/amount")]),
            node("divider","Divider")
        ],revision:1)
        XCTAssertEqual(try doc.value(id:"slider",property:"value"),.number(40))
        XCTAssertThrowsError(try doc.updateComponents(doc.components,revision:1))
        XCTAssertEqual(try JSONDecoder().decode(A2UIDocument.self,from:JSONEncoder().encode(doc)),doc)
    }
}
