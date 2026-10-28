import SwiftUI

struct ConversationHistoryView: View {
    let archive: ConversationArchive?
    let error: String?
    let more: () -> Void
    var body: some View {
        Section("Conversation") {
            if let error { Text(error).foregroundStyle(.secondary) }
            if let archive, archive.historyLoaded {
                if archive.entries.isEmpty { Text("No messages in this conversation.").foregroundStyle(.secondary) }
                ForEach(archive.entries) { entry in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(label(entry)).font(.caption).foregroundStyle(.secondary)
                        if !entry.text.isEmpty { Text(entry.text).textSelection(.enabled) }
                        if entry.unsupportedContent == true {
                            Text("This message contains content whose preview is not available yet.").font(.caption).foregroundStyle(.secondary)
                        }
                        if let surface = entry.surface {
                            DisclosureGroup("Saved interface") {
                                VisualNodesView(state: historical(surface)) { _, _, _ in }
                            }
                        }
                    }
                }
                if archive.hasMore { Button("Load more history", action: more) }
            } else if error == nil { Text("History has not loaded.").foregroundStyle(.secondary) }
            if let archive {
                ForEach(archive.pendingOperations) { operation in
                    VStack(alignment: .leading) {
                        Text(operation.kind == .message ? "Message delivery pending" : "Cancellation delivery pending")
                            .font(.caption).foregroundStyle(.secondary)
                        if let text = operation.message { Text(text) }
                        Text("Resolve delivery before retrying.").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
    private func label(_ entry: GatewayHistoryEntry) -> String {
        if entry.kind == "message" { return entry.role == "user" ? "You" : "Agent · " + entry.status }
        if entry.kind == "function_call" { return "Tool · " + entry.status }
        return "History item · preview unavailable"
    }
    private func historical(_ surface: VisualSurface) -> VisualState {
        var state = VisualState(surface: surface)
        try? state.reconcile(surface, acknowledgedActionIDs: [], resolvedNodeIDs: Set(surface.nodes.filter { [.askChoice, .askForm, .askApproval, .pageChecklist].contains($0.kind) }.map(\.id)))
        return state
    }
}
