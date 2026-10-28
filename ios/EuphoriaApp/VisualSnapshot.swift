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

/// Same SwiftData store, separate canonical session projection; never an alternate user profile or domain store.
@Model
final class ConversationSnapshot {
    @Attribute(.unique) var identity: String
    var archive: Data
    init(identity: String, archive: Data) { self.identity = identity; self.archive = archive }
}
@MainActor
struct ConversationSnapshotRepository {
    let context: ModelContext
    func load(scope: String, sessionID: String) throws -> ConversationArchive? {
        let key = scope + ":" + sessionID
        let records = try context.fetch(FetchDescriptor<ConversationSnapshot>())
        guard let record = records.first(where: { $0.identity == key }) else { return nil }
        let archive = try JSONDecoder().decode(ConversationArchive.self, from: record.archive)
        guard archive.sessionID == sessionID else { throw GatewayClientError.invalidResponse }
        return archive
    }
    func save(_ archive: ConversationArchive, scope: String) throws {
        let key = scope + ":" + archive.sessionID
        let bytes = try JSONEncoder().encode(archive)
        let records = try context.fetch(FetchDescriptor<ConversationSnapshot>())
        if let record = records.first(where: { $0.identity == key }) { record.archive = bytes }
        else { context.insert(ConversationSnapshot(identity: key, archive: bytes)) }
        try context.save()
    }
}
