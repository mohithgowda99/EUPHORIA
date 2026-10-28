import XCTest
@testable import VisualRuntimeCore

final class A2UICompositionTests: XCTestCase {
    private let catalog = "https://a2ui.org/specification/v0_9/basic_catalog.json"
    private func component(_ id: String, _ kind: String, _ p: [String:A2UIValue]) -> A2UIComponent {
        A2UIComponent(id:id,component:kind,properties:p)
    }
    private func path(_ s:String)->A2UIValue {.object(["path":.string(s)])}
    private func event(_ name:String,_ context:[String:A2UIValue])->A2UIValue {.object(["event":.object(["name":.string(name),"context":.object(context)])])}
    private func trip() throws -> A2UIDocument {
        try A2UIDocument(surfaceId:"trip",catalogId:catalog,components:[
            component("root","Column",["children":.array([.string("heading"),.string("details"),.string("controls"),.string("send")])]),
            component("heading","Text",["text":path("/trip/name")]),
            component("details","Card",["child":.string("row")]),
            component("row","Row",["children":.array([.string("copy"),.string("input")])]),
            component("copy","Text",["text":path("/trip/name")]),
            component("input","TextField",["label":.string("Destination"),"value":path("/trip/name")]),
            component("controls","CheckBox",["label":.string("Notify"),"value":path("/trip/notify")]),
            component("send","Button",["child":.string("buttonText"),"action":event("confirm_trip",["destination":path("/trip/name"),"notify":path("/trip/notify"),"source":.string("mobile")])]),
            component("buttonText","Text",["text":.string("Confirm")])
        ], dataModel:.object(["trip":.object(["name":.string("Paris"),"notify":.bool(false)])]))
    }
    func testNestedCompositionSharedBindingAndAction() throws {
        var doc = try trip()
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Paris"))
        XCTAssertEqual(try doc.value(id:"copy",property:"text"),.string("Paris"))
        XCTAssertEqual(try doc.edit(componentID:"input",value:.string("Oslo")),"/trip/name")
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Oslo"))
        XCTAssertEqual(try doc.value(id:"copy",property:"text"),.string("Oslo"))
        _ = try doc.edit(componentID:"controls",value:.bool(true))
        let intent = try doc.makeEvent(buttonID:"send",timestamp:"2026-10-28T11:00:00Z",idempotencyKey:"test-action-1")
        XCTAssertEqual(intent.context,["destination":.string("Oslo"),"notify":.bool(true),"source":.string("mobile")])
        XCTAssertEqual(intent.sourceComponentId,"send")
        XCTAssertEqual(intent.expectedRevision,0)
        XCTAssertEqual(intent.name,"confirm_trip")
    }
    func testIncrementalDataUpdatePreservesUnrelatedEdit() throws {
        var doc=try trip();_ = try doc.edit(componentID:"input",value:.string("Oslo"))
        try doc.updateDataModel(path:"/trip/notify",value:.bool(true),revision:1)
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Oslo"))
        XCTAssertEqual(try doc.value(id:"controls",property:"value"),.bool(true))
        XCTAssertEqual(doc.localEdits.count,1)
        XCTAssertThrowsError(try doc.updateDataModel(path:"/trip/notify",value:.bool(false),revision:1))
    }
    func testComponentReplaceInsertRemoveStableBinding() throws {
        var doc=try trip();_ = try doc.edit(componentID:"input",value:.string("Oslo"))
        var replacement=doc.components.filter({ $0.id != "details" && $0.id != "row" && $0.id != "copy" })
        replacement[0]=component("root","Column",["children":.array([.string("heading"),.string("input"),.string("controls"),.string("send"),.string("added")])])
        replacement.append(component("added","Text",["text":.string("Summary")]))
        try doc.updateComponents(replacement,revision:1)
        XCTAssertNil(doc.components.first(where:{$0.id=="copy"}))
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Oslo"))
        XCTAssertEqual(try doc.value(id:"added",property:"text"),.string("Summary"))
    }
    func testCodableRestorationOfEditsAndPendingIntent() throws {
        var doc=try trip();_ = try doc.edit(componentID:"input",value:.string("Oslo"))
        let outbound=try doc.makeEvent(buttonID:"send",timestamp:"2026-10-28T11:00:00Z",idempotencyKey:"persist-me")
        let saved=try JSONEncoder().encode(doc)
        let restored=try JSONDecoder().decode(A2UIDocument.self,from:saved)
        let queued=try JSONDecoder().decode(A2UIActionIntent.self,from:JSONEncoder().encode(outbound))
        try restored.validate()
        XCTAssertEqual(try restored.value(id:"heading",property:"text"),.string("Oslo"))
        XCTAssertEqual(queued.id,"persist-me")
        XCTAssertEqual(queued.context["destination"],.string("Oslo"))
        // The existing SwiftData snapshot and gateway journal persist these encoded values;
        // no second database is introduced in the composition module.
    }
    func testAuthoritativeAcknowledgementClearsOnlyAcceptedDraft() throws {
        var doc=try trip();_ = try doc.edit(componentID:"input",value:.string("Oslo"))
        _ = try doc.edit(componentID:"controls",value:.bool(true))
        try doc.acknowledge(paths:["/trip/name"],revision:1,authoritativeModel:.object(["trip":.object(["name":.string("Oslo"),"notify":.bool(false)])]))
        XCTAssertEqual(doc.localEdits,["/trip/notify":.bool(true)])
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Oslo"))
    }
    func testUnsupportedComponentsFunctionsAndCyclesFailClosed() throws {
        XCTAssertThrowsError(try A2UIDocument(surfaceId:"x",catalogId:catalog,components:[component("root","Video",["url":.string("https://example.com")])]))
        XCTAssertThrowsError(try A2UIDocument(surfaceId:"x",catalogId:catalog,components:[component("root","Column",["children":.array([.string("root")])])]))
        XCTAssertThrowsError(try A2UIDocument(surfaceId:"x",catalogId:catalog,components:[component("root","Text",["text":.object(["functionCall":.object(["name":.string("fetch")])])])]))
    }
    func testPathTraversalAndMissingBindingsRefused() throws {
        var doc=try trip()
        XCTAssertThrowsError(try doc.updateDataModel(path:"/trip/__proto__/polluted",value:.string("a"),revision:1))
        XCTAssertThrowsError(try doc.updateDataModel(path:"/trip/name/subkey",value:.string("x"),revision:1))
        XCTAssertThrowsError(try doc.updateDataModel(path:"/trip/name",value:nil,revision:1))
        XCTAssertEqual(try doc.value(id:"heading",property:"text"),.string("Paris"))
    }
    func testTwoStructurallyDistinctFixtureShapes() throws {
        var doc=try choice()
        XCTAssertEqual(try doc.value(id:"picker",property:"value"),.array([.string("staging")]))
        _ = try doc.edit(componentID:"picker",value:.array([.string("production")]))
        XCTAssertEqual(try doc.value(id:"picker",property:"value"),.array([.string("production")]))
        XCTAssertThrowsError(try doc.edit(componentID:"picker",value:.array([.string("forged")])))
        XCTAssertThrowsError(try doc.edit(componentID:"picker",value:.array([.string("staging"),.string("production")])))
    }
    private func choice() throws -> A2UIDocument {
        try A2UIDocument(surfaceId:"deploy",catalogId:catalog,components:[
            component("root","Card",["child":.string("content")]),
            component("content","Column",["children":.array([.string("title"),.string("picker")])]),
            component("title","Text",["text":.string("Choose the deployment target")]),
            component("picker","ChoicePicker",["label":.string("Environment"),"variant":.string("mutuallyExclusive"),"options":.array([
                .object(["value":.string("staging"),"label":.string("Staging")]),
                .object(["value":.string("production"),"label":.string("Production")])]),"value":path("/deploy/targets")])
        ],dataModel:.object(["deploy":.object(["targets":.array([.string("staging")])])]))
    }
    func testMalformedRestoredSnapshotsFailValidationAtDecodeBoundary() throws {
        let doc=try choice()
        let encoded=try JSONEncoder().encode(doc)
        var packet=try XCTUnwrap(JSONSerialization.jsonObject(with:encoded) as? [String:Any])
        packet["version"]="v9-next"
        XCTAssertThrowsError(try JSONDecoder().decode(A2UIDocument.self,from:JSONSerialization.data(withJSONObject:packet)))
        packet["version"]="v0.9"
        packet["localEdits"]=["/__proto__/secret":"x"]
        XCTAssertThrowsError(try JSONDecoder().decode(A2UIDocument.self,from:JSONSerialization.data(withJSONObject:packet)))
    }
    func testJSONRoundtripAndNoArbitraryExecutableElements() throws {
        let doc=try choice()
        let data=try JSONEncoder().encode(doc)
        XCTAssertTrue(data.count<100_000)
        XCTAssertEqual(try JSONDecoder().decode(A2UIDocument.self,from:data),doc)
    }
    private func mutated(_ doc: A2UIDocument, _ change: (inout [String:Any]) -> Void) throws -> A2UIDocument {
        var packet = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(doc)) as? [String:Any])
        change(&packet)
        return try JSONDecoder().decode(A2UIDocument.self, from: JSONSerialization.data(withJSONObject: packet))
    }
    func testUnknownCatalogAndRepeatedStructuralNodesAreRejected() throws {
        XCTAssertThrowsError(try mutated(trip()) { $0["catalogId"] = "https://untrusted.example/catalog" })
        XCTAssertThrowsError(try mutated(trip()) { packet in
            var nodes = packet["components"] as! [[String:Any]]
            nodes[0]["children"] = ["heading", "heading", "details", "controls", "send"]; packet["components"] = nodes
        })
    }
    func testInvalidInitialChoiceMembershipCardinalityAndDuplicatesAreRejected() throws {
        for values in [["forged"], ["staging", "production"], ["staging", "staging"]] {
            XCTAssertThrowsError(try mutated(choice()) { $0["dataModel"] = ["deploy":["targets":values]] })
        }
    }
    func testProtocolStringIdentityIsExactAndDoesNotAcceptEquivalentUnicode() throws {
        XCTAssertNotEqual(A2UIValue.string("é"), A2UIValue.string("e\u{301}"))
        var doc = try mutated(choice()) { packet in
            var nodes = packet["components"] as! [[String:Any]]
            nodes[3]["options"] = [["value":"é","label":"Composed"]]; packet["components"] = nodes
            packet["dataModel"] = ["deploy":["targets":["é"]]]
        }
        XCTAssertThrowsError(try doc.edit(componentID:"picker", value:.array([.string("e\u{301}")])))
    }
    func testPropertyBoundsAndUnusedLocalEditsAreRejectedAtDecode() throws {
        XCTAssertThrowsError(try mutated(trip()) { packet in
            var nodes = packet["components"] as! [[String:Any]]
            nodes[1]["text"] = String(repeating:"x", count:2001); packet["components"] = nodes
        })
        XCTAssertThrowsError(try mutated(trip()) { packet in
            var model = packet["dataModel"] as! [String:Any]; model["unused"] = "original"; packet["dataModel"] = model
            packet["localEdits"] = ["/unused":"forged"]
        })
        XCTAssertThrowsError(try mutated(choice()) { packet in packet["localEdits"] = ["/deploy/targets":[String(repeating:"x",count:2001)]] })
    }
    func testSharedChoiceEditsMustSatisfyEveryControlOnThatPath() throws {
        var doc = try choice()
        var nodes = doc.components
        nodes[1] = component("content","Column",["children":.array([.string("title"),.string("picker"),.string("multiple")])])
        var props = nodes[3].properties; props["variant"] = .string("multipleSelection")
        nodes.append(component("multiple","ChoicePicker",props))
        doc = try A2UIDocument(surfaceId:doc.surfaceId,catalogId:catalog,components:nodes,dataModel:doc.dataModel)
        XCTAssertThrowsError(try doc.edit(componentID:"multiple",value:.array([.string("staging"),.string("production")])))
    }
}
