import XCTest
import SwiftData
@testable import Euphoria

@MainActor
final class VisualPersistenceTests: XCTestCase {
    func testA2UICompositionUsesExistingDiskSnapshotForSharedDraftAndPendingEvent() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        defer {try? FileManager.default.removeItem(at:directory)}
        let url=directory.appendingPathComponent("composition.store")
        var original=VisualState(surface:try SourceFixtures.compositionSurface())
        try original.apply(VisualAction(id:"draft",surfaceID:original.surface.surfaceID,expectedRevision:original.surface.revision,nodeID:"composition",kind:.setField,values:["component":.text("field"),"value":.text("Kyoto")]))
        try original.apply(VisualAction(id:"source-pending",surfaceID:original.surface.surfaceID,expectedRevision:original.surface.revision,nodeID:"composition",kind:.submitForm,values:try original.compositionSubmissionValues(nodeID:"composition",buttonID:"submit")))
        try autoreleasepool {
            let container=try ModelContainer(for:VisualSnapshot.self,configurations:ModelConfiguration(url:url,cloudKitDatabase:.none))
            try VisualSnapshotRepository(context:ModelContext(container)).save(original)
        }
        let reopened=try ModelContainer(for:VisualSnapshot.self,configurations:ModelConfiguration(url:url,cloudKitDatabase:.none))
        let saved=try XCTUnwrap(VisualSnapshotRepository(context:ModelContext(reopened)).load(surfaceID:original.surface.surfaceID))
        XCTAssertEqual(saved.pending.map(\.id),["source-pending"])
        XCTAssertEqual(try saved.compositionDocument(nodeID:"composition").value(id:"mirror",property:"text"),.string("Kyoto"))
        XCTAssertEqual(saved.pending.first?.values["context:destination"],.text("Kyoto"))
    }
    func testSwiftDataSnapshotCanRestoreInNewContext() throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: VisualSnapshot.self, configurations: config)
        let first = ModelContext(container)
        var state = VisualState(surface: try SourceFixtures.surface())
        try state.apply(VisualAction(id: "persist-1", surfaceID: state.surface.surfaceID,
            expectedRevision: state.surface.revision, nodeID: "page_tasks", kind: .toggle,
            values: ["item": .text("review"), "checked": .flag(true)]))
        try VisualSnapshotRepository(context: first).save(state)
        let second = ModelContext(container)
        let recovered = try VisualSnapshotRepository(context: second).load(surfaceID: state.surface.surfaceID)
        XCTAssertEqual(recovered, state)
        XCTAssertEqual(recovered?.pending.map(\.id), ["persist-1"])
    }

    func testSwiftDataPreservesFormDraftAndPendingDecision() throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: VisualSnapshot.self, configurations: config)
        let first = ModelContext(container)
        var state = VisualState(surface: try SourceFixtures.surface())
        let common = (surface: state.surface.surfaceID, revision: state.surface.revision)
        try state.apply(VisualAction(id: "draft-team", surfaceID: common.surface,
            expectedRevision: common.revision, nodeID: "brief", kind: .setField,
            values: ["team": .text("EUPHORIA")]))
        try state.apply(VisualAction(id: "answer-staging", surfaceID: common.surface,
            expectedRevision: common.revision, nodeID: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")]))
        try VisualSnapshotRepository(context: first).save(state)
        let recovered = try VisualSnapshotRepository(context: ModelContext(container)).load(surfaceID: common.surface)
        XCTAssertEqual(recovered?.values["brief.team"], .text("EUPHORIA"))
        XCTAssertEqual(recovered?.pending.map(\.id), ["answer-staging"])
    }

    func testDiskSnapshotSurvivesContainerReopen() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("snapshot.store")
        var original = VisualState(surface: try SourceFixtures.surface())
        try original.apply(VisualAction(id: "disk-draft", surfaceID: original.surface.surfaceID,
            expectedRevision: original.surface.revision, nodeID: "brief", kind: .setField,
            values: ["team": .text("Saved locally")]))
        try original.apply(VisualAction(id: "disk-choice", surfaceID: original.surface.surfaceID,
            expectedRevision: original.surface.revision, nodeID: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")]))

        try original.apply(VisualAction(id: "disk-note", surfaceID: original.surface.surfaceID,
            expectedRevision: original.surface.revision, nodeID: "refund", kind: .setField,
            values: ["note": .text("Review duplicate charge")]))
        try autoreleasepool {
            let container = try ModelContainer(for: VisualSnapshot.self,
                configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
            try VisualSnapshotRepository(context: ModelContext(container)).save(original)
        }
        // New container over the same SQLite store, not a second context over memory.
        let reopened = try ModelContainer(for: VisualSnapshot.self,
            configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
        let restored = try VisualSnapshotRepository(context: ModelContext(reopened))
            .load(surfaceID: original.surface.surfaceID)
        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored?.values["brief.team"], .text("Saved locally"))
        XCTAssertEqual(restored?.pending.map(\.id), ["disk-choice"])
        XCTAssertEqual(restored?.approvalNote(nodeID: "refund"), "Review duplicate charge")
    }

    func testConversationIntentsSurviveDiskReopenAndAreAccountScoped() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("conversation.store")
        var archive = ConversationArchive(sessionID: "sess_test")
        try archive.enqueue(GatewayInputIntent(id: "message-1", kind: .message, message: "Keep my follow-up"))
        try autoreleasepool {
            let container = try ModelContainer(for: ConversationSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
            try ConversationSnapshotRepository(context: ModelContext(container)).save(archive, scope: "account-a")
        }
        let reopened = try ModelContainer(for: ConversationSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
        let repository = ConversationSnapshotRepository(context: ModelContext(reopened))
        XCTAssertEqual(try repository.load(scope: "account-a", sessionID: "sess_test")?.operations.first?.message, "Keep my follow-up")
        XCTAssertNil(try repository.load(scope: "account-b", sessionID: "sess_test"))
    }

    func testSourceFormDraftAndActionRetainBindingsAcrossDiskReopen() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("source-form.store")
        var state = VisualState(surface: try SourceFixtures.a2uiFormSurface())
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text("Paris")])
        try state.apply(VisualAction(id: "edit", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text("Kyoto")]))
        try autoreleasepool {
            let container = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
            try VisualSnapshotRepository(context: ModelContext(container)).save(state)
        }
        let reopened = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
        var recovered = try XCTUnwrap(VisualSnapshotRepository(context: ModelContext(reopened)).load(surfaceID: state.surface.surfaceID))
        let values = try recovered.proposedFormValues(nodeID: "form")
        XCTAssertEqual(values, ["field_0": .text("Kyoto")])
        XCTAssertEqual(recovered.surface.nodes.first?.formEvent?.contextFields["destination"], "field_0")
        try recovered.apply(VisualAction(id: "confirm", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .submitForm, values: values))
        XCTAssertEqual(recovered.pending.first?.values, values)
    }

    func testBooleanAndSelectionDraftsAndPendingSubmissionSurviveDiskReopen() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("controls.store")
        var state = VisualState(surface: try SourceFixtures.a2uiControlsSurface())
        for (id, value): (String, VisualScalar) in [("field_1", .flag(false)), ("field_2", .strings(["push"])), ("field_3", .strings([]))] {
            try state.apply(VisualAction(id: UUID().uuidString, surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: [id: value]))
        }
        try autoreleasepool {
            let container = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
            try VisualSnapshotRepository(context: ModelContext(container)).save(state)
        }
        try autoreleasepool {
            let container = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
            let repo = VisualSnapshotRepository(context: ModelContext(container))
            var recovered = try XCTUnwrap(repo.load(surfaceID: state.surface.surfaceID))
            let values = try recovered.proposedFormValues(nodeID: "form")
            XCTAssertEqual(values["field_1"], .flag(false)); XCTAssertEqual(values["field_2"], .strings(["push"])); XCTAssertEqual(values["field_3"], .strings([]))
            try recovered.apply(VisualAction(id: "confirm", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .submitForm, values: values))
            try repo.save(recovered)
        }
        let container = try ModelContainer(for: VisualSnapshot.self, configurations: ModelConfiguration(url: url, cloudKitDatabase: .none))
        var pending = try XCTUnwrap(VisualSnapshotRepository(context: ModelContext(container)).load(surfaceID: state.surface.surfaceID))
        XCTAssertEqual(pending.pending.first?.values["field_2"], .strings(["push"]))
        XCTAssertThrowsError(try pending.apply(VisualAction(id: "late", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_1": .flag(true)])))
    }

}
