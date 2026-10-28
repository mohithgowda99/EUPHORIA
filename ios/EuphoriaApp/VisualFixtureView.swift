import SwiftUI
import SwiftData

/// Native-only source fixture viewer. No simulated model, server, or approval execution.
struct VisualFixtureView: View {
    var gallery = false
    @Environment(\.modelContext) private var modelContext
    @State private var state: VisualState?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                Text("OpenDuet-derived native interaction fixtures. No agent connected.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if let state {
                    Text("Surface revision \(state.surface.revision) · \(state.pending.count) unsynchronized action(s)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.caption)
                }
            }
            if let state {
                VisualNodesView(state: state, fixture: true) { node, kind, values in
                    enact(node, kind: kind, values: values)
                }
            } else {
                ProgressView("Loading local fixture")
            }
        }
        .navigationTitle("Visual runtime fixtures")
        .task { loadSnapshot() }
    }

    private func enact(_ node: VisualNode, kind: VisualActionKind, values: [String: VisualScalar]) {
        guard var current = state else { return }
        let action = VisualAction(id: UUID().uuidString, surfaceID: current.surface.surfaceID,
                                  expectedRevision: current.surface.revision, nodeID: node.id,
                                  kind: kind, values: values)
        do {
            try current.apply(action)
            try VisualSnapshotRepository(context: modelContext).save(current)
            state = current
            errorMessage = nil
        } catch { errorMessage = "Local validation failed: \(error.localizedDescription)" }
    }

    private func loadSnapshot() {
        do {
            let fixture = try gallery ? SourceFixtures.gallerySurface() : SourceFixtures.surface()
            let repo = VisualSnapshotRepository(context: modelContext)
            let restored = try repo.load(surfaceID: fixture.surfaceID)
            let loaded = restored ?? VisualState(surface: fixture)
            if restored == nil { try repo.save(loaded) }
            state = loaded
            errorMessage = nil
        } catch { errorMessage = "Unable to restore saved fixture: \(error.localizedDescription)" }
    }
}
