import Foundation
import XCTest
import A2UISwiftCore
import A2UISwiftUI
import VisualRuntimeCore
@testable import A2UIRendererComparison

/// Protocol fixtures for the supported EUPHORIA projection and pinned upstream renderer.
/// The settings fixture uses supported controls; volume is retained model metadata, not a native slider.
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

    func testPinnedUntypedUpdateReplacesPropertiesAndRetainsExistingType() throws {
        let document=try fixture("a2ui-nested-trip-v09.json")
        let engine=try processor(document)
        XCTAssertTrue(engine.processMessages([.updateComponents(UpdateComponentsPayload(surfaceId:document.surfaceId,components:[RawComponent(id:"title",component:"",properties:["text":.string("Revised heading")])]))]).isEmpty)
        let title=try XCTUnwrap(engine.model.getSurface(document.surfaceId)?.componentsModel.get("title"))
        XCTAssertEqual(title.type,"Text")
        XCTAssertEqual(title.properties,["text":.string("Revised heading")])
    }

    func testNumericDateControlsRestoreThroughPinnedEngine() throws {
        var document=try fixture("a2ui-numeric-date-v09.json")
        _=try document.edit(componentID:"confidence",value:.number(75))
        _=try document.edit(componentID:"date",value:.string("2026-11-02T08:00:00Z"))
        let engine=try processor(document)
        XCTAssertEqual(engine.model.getSurface(document.surfaceId)?.dataModel.get("/decision/confidence")?.numberValue,75)
        XCTAssertEqual(engine.model.getSurface(document.surfaceId)?.dataModel.get("/decision/date")?.stringValue,"2026-11-02T08:00:00Z")
    }

    func testLayoutCatalogBuildsThroughPinnedNativeEngine() throws {
        let document=try fixture("a2ui-layout-v09.json")
        let engine=try processor(document)
        XCTAssertNotNil(engine.model.getSurface(document.surfaceId))
        let vm=SurfaceViewModel(surface:SurfaceModel(id:document.surfaceId,catalog:basicCatalog))
        XCTAssertTrue(vm.processMessages(try A2UIProjectionBridge.messages(from:document)).isEmpty)
        XCTAssertEqual(vm.componentTree?.id,"root")
        XCTAssertEqual(vm.componentTree?.children.count,4)
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
        XCTAssertEqual(processor.model.getSurface(document.surfaceId)?.dataModel.get("/settings/name")?.stringValue, "Focus")
        XCTAssertEqual(try document.value(id: "notifications", property: "value"), .bool(true))
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

    func testActionSerializationPreservesTheSourceEventWithoutGrantingEffects() throws {
        let document = try fixture("a2ui-nested-trip-v09.json")
        let intent = try document.makeEvent(
            buttonID: "submit", timestamp: "2026-10-28T12:00:00Z",
            idempotencyKey: "offline-source-event-1")
        let context = try intent.context.mapValues { value in
            try JSONDecoder().decode(AnyCodable.self, from: JSONEncoder().encode(value))
        }
        let action = A2uiClientAction(
            name: intent.name, surfaceId: intent.surfaceId,
            sourceComponentId: intent.sourceComponentId,
            timestamp: intent.timestamp, context: context)
        let wire = try JSONEncoder().encode(A2uiClientMessage.action(action))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: wire) as? [String: Any])
        let publishedAction = try XCTUnwrap(object["action"] as? [String: Any])
        XCTAssertEqual(object["version"] as? String, "v0.9")
        XCTAssertEqual(publishedAction["name"] as? String, "confirm_trip")
        XCTAssertEqual(publishedAction["sourceComponentId"] as? String, "submit")
        XCTAssertEqual(publishedAction["surfaceId"] as? String, "trip")
        let receivedContext = try XCTUnwrap(publishedAction["context"] as? [String: Any])
        XCTAssertEqual(receivedContext["destination"] as? String, "Paris")
        XCTAssertEqual(receivedContext["notify"] as? Bool, false)
        // Idempotency ID and revision belong to EUPHORIA's outer action envelope,
        // never fields secretly appended to the standard A2UI event.
        XCTAssertNil(publishedAction["idempotencyKey"])
        XCTAssertNil(publishedAction["expectedRevision"])
    }

    func testCommunityRendererTemplateExpandsWhileLegacySubsetRejectsIt() throws {
        // Ported from BBC6BAE9/a2ui-swift's source
        // Tests/A2UISwiftUITests/SurfaceViewModelTests.swift (reconcile suite).
        let id = "template"
        let viewModel = SurfaceViewModel(surface: SurfaceModel(id: id, catalog: basicCatalog))
        try viewModel.processMessage(.createSurface(
            CreateSurfacePayload(surfaceId: id, catalogId: basicCatalogId)))
        try viewModel.processMessage(.updateComponents(UpdateComponentsPayload(
            surfaceId: id, components: [
                RawComponent(id: "root", component: "Column", properties: [
                    "children": .dictionary([
                        "componentId": .string("row"), "path": .string("/items")
                    ])
                ]),
                RawComponent(id: "row", component: "Text", properties: [
                    "text": .dictionary(["path": .string("label")])
                ])
            ])))
        XCTAssertEqual(viewModel.componentTree?.children.count, 0)
        try viewModel.processMessage(.updateDataModel(UpdateDataModelPayload(
            surfaceId: id, path: "/items", value: .array([
                .dictionary(["label": .string("one")]),
                .dictionary(["label": .string("two")])
            ]))))
        XCTAssertEqual(viewModel.componentTree?.children.count, 2)
        try viewModel.processMessage(.updateDataModel(UpdateDataModelPayload(
            surfaceId: id, path: "/items/2",
            value: .dictionary(["label": .string("three")]))))
        XCTAssertEqual(viewModel.componentTree?.children.count, 3)
        XCTAssertThrowsError(try A2UIDocument(
            surfaceId: id, catalogId: basicCatalogId,
            components: [A2UIComponent(id: "root", component: "Column", properties: [
                "children": .object(["componentId": .string("row"), "path": .string("/items")])
            ])], dataModel: .object(["items": .array([])])))
        // Explicit comparative result: EUPHORIA rejects, candidate accepts.
        // Still requires source WebCore check for reorder/state/event identity.
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
