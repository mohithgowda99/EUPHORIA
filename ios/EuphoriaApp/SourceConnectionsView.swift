import SwiftUI

/// Original OpenDuet connected-account ledger. This reads server-confirmed
/// grants, including vendor-brokered and team-shared connections; a provider
/// redirect by itself is never treated as an authenticated connection.
struct SourceConnectionsView: View {
    @State private var connections: [SourceConnectedApp] = []
    @State private var client: OpenDuetSourceAPI?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Only connections reported by your original OpenDuet plugin service are shown. Account linking, reauthorization and revocation must be enforced by its source broker and user-grant policies.")
                    .font(.caption).foregroundStyle(.secondary)
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh connections") { Task { await reload() } }
                }
            }
            Section("Connected accounts") {
                ForEach(connections.indices, id: \.self) { index in
                    let connection = connections[index]
                    VStack(alignment: .leading, spacing: 5) {
                        Text(connection.serverId).font(.headline)
                        LabeledContent("Holder", value: connection.holder == "deployment" ? "Shared deployment" : "Personal")
                        if let scope = connection.scope, !scope.isEmpty {
                            Text(scope).font(.caption).foregroundStyle(.secondary)
                        }
                        if let verified = connection.verified {
                            Text(verified ? "Broker reported verified" : "Broker verification not confirmed")
                                .font(.caption).foregroundStyle(verified ? .secondary : .orange)
                        }
                        if let time = connection.connectedAt {
                            Text("Recorded: " + time).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if connections.isEmpty && !busy && error == nil {
                    Text("No source-confirmed connected accounts.").foregroundStyle(.secondary)
                }
                Text("This screen never asks the AI to connect an account or pretends that visiting an OAuth page granted access.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if busy { ProgressView("Reading original connected apps…") }
        }
        .navigationTitle("Connections")
        .refreshable { await reload() }
        .task { await reload() }
    }

    private func reload() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            let result = try await source.sourceConnections()
            client = source
            connections = result.connections
            error = nil
        } catch {
            client = nil
            error = "The original plugin broker connection state could not be verified. Sign in under Bots."
        }
    }
}
