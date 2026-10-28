import SwiftUI
import SwiftData

/// Canonical gateway sessions are today's work records. No copied task lifecycle or fake completion.
struct WorkListView: View {
    @Environment(\.modelContext) private var context
    @State private var model: GatewaySessionModel?
    @State private var query = ""
    @State private var showsTask = false
    @State private var showsDevelopment = false
    @State private var setupError: String?

    var body: some View {
        NavigationStack {
            List {
                if let model {
                    if model.sessions.contains(where:{$0.verificationMode == "fixture"}) {
                        Section { Text("Local test provider — no model inference").font(.caption).foregroundStyle(.orange) }
                    }
                    if model.hasSession || model.hasPendingCreation {
                        Section {
                            Button(model.hasPendingCreation ? "Resume pending request" : "Resume last task") { showsTask = true }
                                .disabled(model.isBusy)
                        }
                    }
                    if let error = model.sessionsError {
                        Section { Text(error).foregroundStyle(.secondary) }
                    }
                    Section {
                        ForEach(filtered(model.sessions), id: \.sessionID) { session in
                            Button {
                                Task {
                                    await model.selectSession(session)
                                    if model.liveSessionID == session.sessionID { showsTask = true }
                                }
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(session.title ?? "Task").foregroundStyle(.primary).lineLimit(2)
                                        Text(status(session.phase)).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                                }
                            }
                            .disabled(model.isBusy || model.hasPendingCreation)
                        }
                        if model.isLoadingSessions { ProgressView("Loading tasks…") }
                        else if model.sessions.isEmpty && model.sessionsError == nil {
                            Text("No tasks yet. Start with something you want to work on.").foregroundStyle(.secondary)
                        } else if !model.sessions.isEmpty && filtered(model.sessions).isEmpty {
                            Text("No matching tasks in the loaded pages.").foregroundStyle(.secondary)
                        }
                        if model.hasMoreSessions {
                            Button("Load more tasks") { Task { await model.loadSessions(more: true) } }
                                .disabled(model.isLoadingSessions || model.isBusy)
                        }
                    } footer: {
                        if !model.sessions.isEmpty { Text("Last known status. Open a task to follow its progress.") }
                    }
                    if model.sessionsError != nil {
                        Button("Try loading tasks again") { Task { await model.loadSessions() } }.disabled(model.isLoadingSessions)
                    }
                } else if let setupError {
                    ContentUnavailableView("Gateway not configured", systemImage: "network.slash", description: Text(setupError))
                } else { ProgressView("Opening tasks…") }
            }
            .navigationTitle("Tasks")
            .searchable(text: $query, prompt: "Search loaded tasks")
            .toolbar {
                if let model {
                    ToolbarItem(placement: .primaryAction) {
                        Button("New task", systemImage: "plus") { model.newConversation(); showsTask = true }
                            .disabled(model.isBusy || model.hasPendingCreation)
                    }
                }
                #if DEBUG
                ToolbarItem(placement: .secondaryAction) {
                    Button("Development tools", systemImage: "hammer") { showsDevelopment = true }
                }
                #endif
            }
            .refreshable { await model?.loadSessions() }
            .navigationDestination(isPresented: $showsTask) {
                if let model { GatewaySessionView(model: model) }
            }
            .sheet(isPresented: $showsDevelopment) { DevelopmentToolsView().presentationDragIndicator(.visible) }
            .task {
                if model == nil {
                    do { model = try GatewaySessionModel.configured(context: context) }
                    catch { setupError = "A configured development gateway is required. Production account connection is not implemented yet." }
                }
                await model?.loadSessions()
            }
            .onChange(of: showsTask) { _, isOpen in
                if !isOpen { Task { await model?.loadSessions() } }
            }
        }
    }
    private func filtered(_ sessions: [GatewayEnvelope]) -> [GatewayEnvelope] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return search.isEmpty ? sessions : sessions.filter { ($0.title ?? "Task").localizedCaseInsensitiveContains(search) }
    }
    private func status(_ phase: String) -> String {
        switch phase {
        case "waiting": return "Needs your response"
        case "accepted", "in_progress": return "Working"
        case "idle": return "Idle"
        case "cancelled": return "Cancelled"
        case "failed": return "Failed"
        case "render_failed": return "Interface unavailable"
        case "uncertain": return "Delivery needs attention"
        default: return "Status unavailable"
        }
    }
}
