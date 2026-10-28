import Foundation

public struct GatewayHistoryEntry: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let kind: String
    public let status: String
    public let text: String
    public let role: String?
    public let turnID: String?
    public let legacy: Bool?
    public let unsupportedContent: Bool?
    public let surface: VisualSurface?
}
public struct GatewayHistoryPage: Decodable, Sendable {
    public let sessionID: String
    public let entries: [GatewayHistoryEntry]
    public let hasMore: Bool
    public let nextCursor: String?
    public let order: String?
}
public struct GatewayInputReceipt: Codable, Sendable {
    public let id: String
    public let phase: String
    public init(id: String, phase: String) { self.id = id; self.phase = phase }
}
public struct GatewayInputReceipts: Decodable, Sendable { public let operations: [GatewayInputReceipt] }
public struct GatewaySessionList: Decodable, Sendable { public let sessions: [GatewayEnvelope] }
public enum GatewayInputKind: String, Codable, Sendable { case message, cancel }
public struct GatewayInputIntent: Codable, Sendable, Identifiable {
    public let id: String
    public let kind: GatewayInputKind
    public let message: String?
    public fileprivate(set) var phase: String
    public init(id: String, kind: GatewayInputKind, message: String? = nil) {
        self.id = id; self.kind = kind; self.message = message; phase = "pending"
    }
}
/// Conversation history is a validated provider projection; user inputs are separate durable intents.
public struct ConversationArchive: Codable, Sendable {
    public let sessionID: String
    public private(set) var entries: [GatewayHistoryEntry] = []
    public private(set) var operations: [GatewayInputIntent] = []
    public private(set) var historyLoaded = false
    public private(set) var hasMore = false
    public private(set) var nextCursor: String?
    private var olderInsertionID: String?
    public init(sessionID: String) { self.sessionID = sessionID }
    public var pendingOperations: [GatewayInputIntent] { operations.filter { ["pending", "uncertain"].contains($0.phase) } }
    public mutating func enqueue(_ input: GatewayInputIntent) throws {
        guard !input.id.isEmpty, operations.count < 500, !operations.contains(where: { $0.id == input.id }),
              input.kind != .message || (input.message?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && input.message!.count <= 16000) else {
            throw GatewayClientError.invalidResponse
        }
        operations.append(input)
    }
    public mutating func reconcile(_ receipts: [GatewayInputReceipt]) throws {
        guard receipts.allSatisfy({ ["pending", "accepted", "uncertain", "cancelled", "rejected"].contains($0.phase) }) else { throw GatewayClientError.invalidResponse }
        for receipt in receipts {
            if let index = operations.firstIndex(where: { $0.id == receipt.id }) { operations[index].phase = receipt.phase }
        }
    }
    /// Newest-page live refresh must not rewind the user's older-page frontier.
    public mutating func mergeLatest(_ page: GatewayHistoryPage) throws {
        let loaded = historyLoaded, cursor = nextCursor, more = hasMore, anchor = olderInsertionID
        try apply(page, reset: true)
        if loaded { nextCursor = cursor; hasMore = more; olderInsertionID = anchor }
    }
    public mutating func apply(_ page: GatewayHistoryPage, reset: Bool) throws {
        guard page.sessionID == sessionID, page.entries.count <= 10, !page.hasMore || page.nextCursor != nil,
              page.entries.allSatisfy({ !$0.id.isEmpty && $0.text.count <= 8000 }) else { throw GatewayClientError.invalidResponse }
        let incoming = page.entries.map { entry in
            if let completed = entries.first(where: { $0.id == entry.id && $0.status == "completed" }), entry.status != "completed" { return completed }
            return entry
        }
        if page.order == "desc" {
            let incomingIDs = Set(incoming.map(\.id))
            var cached = entries.filter { !incomingIDs.contains($0.id) }
            let insertion = reset ? cached.count : cached.firstIndex { $0.id == olderInsertionID } ?? 0
            cached.insert(contentsOf: incoming, at: insertion)
            entries = cached
            if let first = incoming.first { olderInsertionID = first.id }
        } else {
            for entry in incoming {
                if let index = entries.firstIndex(where: { $0.id == entry.id }) { entries[index] = entry }
                else { entries.append(entry) }
            }
        }
        hasMore = page.hasMore; nextCursor = page.nextCursor
        historyLoaded = true
    }
}
