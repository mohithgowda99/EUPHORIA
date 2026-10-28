import XCTest
@testable import VisualRuntimeCore

final class GalleryTests: XCTestCase {
    private func surface(_ gallery: [String: Any]) throws -> VisualSurface {
        let node: [String: Any] = ["id":"gallery", "kind":"gallery", "title":"Source gallery", "gallery":gallery]
        let json: [String: Any] = ["schemaVersion":2,"surfaceID":"s","revision":1,"nodes":[node]]
        return try JSONDecoder().decode(VisualSurface.self, from: JSONSerialization.data(withJSONObject: json))
    }
    func testAllAuthoredGalleryFamiliesDecodeAndValidate() throws {
        for gallery: [String: Any] in [
            ["kind":"record","fields":[["label":"Owner","value":"Me"]]],
            ["kind":"metrics","metrics":[["label":"Revenue","value":"$20","change":"+2%"]]],
            ["kind":"notice","body":"A useful update","tone":"positive"],
            ["kind":"table","columns":["Name","Count"],"rows":[["cells":["A",2]]]],
            ["kind":"bar","points":[["label":"A","value":-2]]],
            ["kind":"pie","points":[["label":"A","value":2]]],
            ["kind":"line","labels":["Mon"],"series":[["name":"A","values":[2]]]],
            ["kind":"area","labels":["Mon"],"series":[["name":"A","values":[-2]]]],
            ["kind":"progress","points":[["label":"A","value":2,"target":4]]]
        ] { XCTAssertNotNil(try surface(gallery).nodes.first?.gallery) }
    }
    func testMalformedTablesAndSeriesFailBeforeRendering() throws {
        XCTAssertThrowsError(try surface(["kind":"table","columns":["A","A"],"rows":[]]))
        XCTAssertThrowsError(try surface(["kind":"table","columns":["A"],"rows":[["cells":[true]]]]))
        XCTAssertThrowsError(try surface(["kind":"line","labels":["M","T"],"series":[["name":"A","values":[1]]]]))
        XCTAssertThrowsError(try surface(["kind":"pie","points":[["label":"A","value":-1]]]))
    }
    func testTableSortUsesNumbersAndStableTies() throws {
        let s = try surface(["kind":"table","columns":["Count"],"rows":[["cells":[10]],["cells":[2]],["cells":[2]]]])
        let gallery = try XCTUnwrap(s.nodes[0].gallery)
        XCTAssertEqual(gallery.orderedRows(column: 0, ascending: true).map(\.id), [1,2,0])
        XCTAssertEqual(gallery.orderedRows(column: 0, ascending: false).map(\.id), [0,1,2])
    }
    func testReadOnlySurfaceDisplayIsADurableReceiptNotAMadeUpQuestion() throws {
        let s = try surface(["kind":"notice","body":"Your requested result"])
        var state = VisualState(surface: s)
        XCTAssertTrue(state.requiresDisplayReceipt)
        try state.apply(VisualAction(id:"shown-1",surfaceID:"s",expectedRevision:1,nodeID:"gallery",kind:.displayed,values:[:]))
        XCTAssertFalse(state.requiresDisplayReceipt)
        let restored = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(state))
        XCTAssertFalse(restored.requiresDisplayReceipt)
        XCTAssertEqual(restored.pending.first?.kind, .displayed)
    }
    func testArtifactPolicyOnlyAllowsItsOwnDocumentNavigation() throws {
        let policy = ArtifactPolicy()
        XCTAssertTrue(policy.allowsNavigation(policy.documentURL))
        XCTAssertFalse(policy.allowsNavigation(URL(string:"https://example.com")!))
        XCTAssertFalse(policy.allowsNavigation(URL(string:"file:///private/file")!))
        XCTAssertFalse(policy.allowsNavigation(URL(string:"javascript:alert(1)")!))
        XCTAssertFalse(policy.allowsNavigation(ArtifactPolicy().documentURL))
    }
    func testCancelledUnreceivedDisplayReceiptCanBeAcknowledgedAgain() throws {
        var state = VisualState(surface: try surface(["kind":"notice","body":"A result"]))
        try state.apply(VisualAction(id:"unsent",surfaceID:"s",expectedRevision:1,nodeID:"gallery",kind:.displayed,values:[:]))
        try state.reconcile(state.surface, acknowledgedActionIDs: [], rejectedActionIDs: ["unsent"])
        XCTAssertTrue(state.requiresDisplayReceipt)
        XCTAssertTrue(state.pending.isEmpty)
    }

    func testBundledGalleryFixtureUsesEverySupportedGalleryKindAndIsolatedArtifact() throws {
        let surface = try SourceFixtures.gallerySurface()
        try surface.validate()
        XCTAssertEqual(surface.schemaVersion, 2)
        XCTAssertEqual(Set(surface.nodes.compactMap { $0.gallery?.kind }), Set([.record,.metrics,.notice,.table,.bar,.pie,.line,.area,.progress]))
        XCTAssertTrue(surface.nodes.contains { $0.kind == .htmlArtifact })
    }

}
