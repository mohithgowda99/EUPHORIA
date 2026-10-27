import Foundation
import SwiftData

/// SwiftData keeps the last rendered surface, local drafts and unacknowledged actions.
/// Cloud session/workflow state remains authoritative once a gateway is implemented.
@Model
final class VisualSnapshot {
    @Attribute(.unique) var surfaceID: String
    var snapshot: Data
    var updatedAt: Date

    init(surfaceID: String, snapshot: Data, updatedAt: Date = .now) {
        self.surfaceID = surfaceID
        self.snapshot = snapshot
        self.updatedAt = updatedAt
    }
}

@MainActor
struct VisualSnapshotRepository {
    let context: ModelContext

    func load(surfaceID: String) throws -> VisualState? {
        let records = try context.fetch(FetchDescriptor<VisualSnapshot>())
        guard let record = records.first(where: { $0.surfaceID == surfaceID }) else { return nil }
        return try JSONDecoder().decode(VisualState.self, from: record.snapshot)
    }

    func save(_ state: VisualState) throws {
        let bytes = try JSONEncoder().encode(state)
        let records = try context.fetch(FetchDescriptor<VisualSnapshot>())
        if let record = records.first(where: { $0.surfaceID == state.surface.surfaceID }) {
            record.snapshot = bytes
            record.updatedAt = .now
        } else {
            context.insert(VisualSnapshot(surfaceID: state.surface.surfaceID, snapshot: bytes))
        }
        try context.save()
    }
}
