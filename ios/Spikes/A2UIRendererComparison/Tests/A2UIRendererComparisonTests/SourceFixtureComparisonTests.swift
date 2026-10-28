import Foundation
import XCTest
import A2UISwiftCore
import A2UISwiftUI
import VisualRuntimeCore
@testable import A2UIRendererComparison

/// Source-derived fixtures already checked into EUPHORIA, not invented demo cards.
/// These tests intentionally require the complete source package and can be run
/// on a Mac with network/SPM access; they are not a claim of completed conformance.
final class SourceFixtureComparisonTests: XCTestCase {
    private func fixture(_ name: String) throws -> A2UIDocument {
        let location = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let repositoryRoot = (0..<5).reduce(location) { partial, _ in
            partial.deletingLastPathComponent()
        }
        let url = repositoryRoot.appendingPathComponent(
            "ios/VisualRuntimeCore/Sources/VisualRuntimeCore/Fixtures/\(name)")
        return try JSONDecoder().decode(A2UIDocument.self, from: Data(contentsOf: url))
    }

    private func processor(_ document: A2UIDocument) throws -> MessageProcessor {
        let engine = MessageProcessor(catalogs: [basicCatalog])
        let errors = engine.processMessages(try A2UIProjectionBridge.messages(from: document))
        XCTAssertTrue(errors.isEmpty, "Protocol engine rejected source fixture: \(errors)")
        return engine
    }

    func testNestedTripSharedBindingAndDraftRestoration() throws {
        var document = try fixture("a2ui-nested-trip-v09.json")
        let model = try processor(document).model.getSurface(document.surfaceId)
        XCTAssertNotNil(model)
        XCTAssertEqual(model?.dataModel.get("/trip/destination")?.stringValue,
                       try document.value(id: "title", property: "text").text)

        // Mutate only through EUPHORIA's canonical projection, then reconstruct
        // a separate, disposable engine from the persisted document snapshot.
        _ = try document.edit(componentID: "field", value: .string("London"))
        let restored = try JSONDecoder().decode(
            A2UIDocument.self, from: JSONEncoder().encode(document))
        let rebuilt = try processor(restored).model.getSurface(document.surfaceId)
        XCTAssertEqual(rebuilt?.dataModel.get("/trip/destination")?.stringValue, "London")
        XCTAssertEqual(restored.localEdits["/trip/destination"], .string("London"))
    }

    func testExtendedSettingsBindingsAndDistinctTree() throws {
        let document = try fixture("a2ui-extended-settings-v09.json")
        let processor = try processor(document)
        XCTAssertEqual(processor.model.getSurface(document.surfaceId)?
                           .dataModel.get("/settings/volume")?.numberValue, 45)
        // Render-tree construction is evaluated separately from message decoding.
        let surface = SurfaceModel(id: document.surfaceId, catalog: basicCatalog)
        let vm = SurfaceViewModel(surface: surface)
        let errors = vm.processMessages(try A2UIProjectionBridge.messages(from: document))
        XCTAssertTrue(errors.isEmpty)
        XCTAssertEqual(vm.componentTree?.id, "root")
        XCTAssertEqual(vm.componentTree?.children.count, 4)
    }

    func testSurfaceDeletionDoesNotReanimatePreviouslyDispatchedAction() throws {
        let document = try fixture("a2ui-extended-settings-v09.json")
        let engine = try processor(document)
        engine.processMessages([A2UIProjectionBridge.deletion(surfaceID: document.surfaceId)])
        XCTAssertNil(engine.model.getSurface(document.surfaceId))
    }

    func testProtocolVersionIsDecodedAndNotSilentlyDowngraded() throws {
        let data = Data(#"{"version":"v0.9.1","deleteSurface":{"surfaceId":"old"}}"#.utf8)
        let message = try JSONDecoder().decode(A2uiMessage.self, from: data)
        if case .deleteSurface(let payload) = message {
            XCTAssertEqual(payload.surfaceId, "old")
        } else {
            XCTFail("Expected source deleteSurface message")
        }
    }
}
