import XCTest
import SwiftData
@testable import Euphoria

@MainActor
final class VisualPersistenceTests: XCTestCase {
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
    }

}
