import SwiftUI

/// Only the original EUPHORIA PluginStore owns connected-service grants and
/// revocation. A browser redirect is not a connected account.
struct SourceConnectionsView: View {
    @Environment(\.openURL) private var openURL
    @State private var connections: [SourceConnectedApp] = []
    @State private var available: [SourcePluginServer] = []
    @State private var client: OpenDuetSourceAPI?
    @State private var busy = false
    @State private var error: String?
    @State private var note: String?
    @State private var disconnectID: String?

    private var connectedIDs: Set<String> {
        Set(connections.map(\.serverId))
    }

    var body: some View {
        List {
            Section {
                Text("Only server-confirmed connected accounts are displayed. Each Bot still needs its own tool grants.")
                    .font(.caption).foregroundStyle(.secondary)
                if let note { Text(note).font(.caption).foregroundStyle(.secondary) }
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh source state") { Task { await reload() } }.disabled(busy)
                }
            }
            Section("Connected accounts") {
                ForEach(Array(connections.enumerated()), id: \.offset) { _, connection in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(connection.serverId).font(.headline)
                        LabeledContent("Holder", value: connection.holder == "deployment" ? "Shared deployment" : "Personal")
                        if let scope = connection.scope, !scope.isEmpty {
                            Text(scope).font(.caption).foregroundStyle(.secondary)
                        }
                        if let verified = connection.verified {
                            Text(verified ? "Broker reported verified" : "Broker verification not confirmed")
                                .font(.caption).foregroundStyle(verified ? Color.secondary : Color.orange)
                        }
                        if let time = connection.connectedAt {
                            Text("Recorded: " + time).font(.caption).foregroundStyle(.secondary)
                        }
                        if connection.holder != "deployment" {
                            Button("Disconnect account", role: .destructive) {
                                disconnectID = connection.serverId
                            }.disabled(busy)
                        } else {
                            Text("Shared deployment accounts are managed by an administrator.")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                if connections.isEmpty && !busy && error == nil {
                    Text("No source-confirmed connected accounts.")
                        .foregroundStyle(.secondary)
                }
            }
            if !available.isEmpty {
                Section("Available connections") {
                    ForEach(available.filter { !connectedIDs.contains($0.id) }) { server in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(server.title).font(.headline)
                            if !server.summary.isEmpty {
                                Text(server.summary).font(.caption).foregroundStyle(.secondary)
                            }
                            if let error = server.lastError {
                                Text("Connector unavailable: " + error)
                                    .font(.caption).foregroundStyle(.orange)
                            }
                            Button("Connect " + server.title) {
                                Task { await beginConnect(server.id) }
                            }
                            .disabled(busy || !server.isAvailable)
                        }
                    }
                }
            }
            if busy { ProgressView("Checking original connection service…") }
        }
        .navigationTitle("Connections")
        .refreshable { await reload() }
        .task { await reload() }
        .confirmationDialog("Disconnect this account?", isPresented: Binding(
            get: { disconnectID != nil },
            set: { if !$0 { disconnectID = nil } }
        ), titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) {
                if let id = disconnectID {
                    Task { await disconnect(id) }
                }
                disconnectID = nil
            }
            Button("Cancel", role: .cancel) { disconnectID = nil }
        } message: {
            Text("This revokes the account using the original connection service. Existing or in-flight managed sessions may require additional reconciliation.")
        }
    }

    private func reload() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            async let ledger = source.sourceConnections()
            async let catalogue = source.availableSourceConnections()
            let current = try await ledger
            connections = current.connections
            available = try await catalogue
            client = source
            self.error = nil
        } catch {
            client = nil
            connections = []
            available = []
            self.error = "The connection service could not be verified. Sign in through Bots and retry."
        }
    }

    private func beginConnect(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            let url = try await client.startSourceConnection(serverID: id)
            openURL(url)
            note = "Complete the consent process in your browser, then return and refresh. A redirect alone does not confirm a connection."
            error = nil
        } catch {
            self.error = "This connection cannot start an OAuth flow here. It may require administrator setup or a credential form supported by the source service."
        }
    }

    private func disconnect(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.disconnectSourceConnection(serverID: id)
            let verified = try await client.sourceConnections()
            connections = verified.connections
            if verified.connections.contains(where: { $0.serverId == id }) {
                error = "The account is still present in the source ledger. Verify revocation before trying again."
            } else {
                error = nil
                note = "The source ledger no longer lists this account. Review any Bot grants and active sessions."
            }
        } catch {
            self.error = "Disconnection outcome is uncertain. Refresh the source ledger before repeating this action."
        }
    }
}
