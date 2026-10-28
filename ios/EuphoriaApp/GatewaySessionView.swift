import SwiftUI
import SwiftData

/// Developer connection proof. Production account setup is intentionally not impersonated here.
struct GatewaySessionView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.modelContext) private var context
    @State private var model: GatewaySessionModel?
    @State private var message = ""
    @State private var setupError: String?
    @State private var showsDevelopmentTools = false
    private let showsRoster: Bool
    init(model: GatewaySessionModel? = nil) {
        _model = State(initialValue: model); showsRoster = model == nil
    }
    var body: some View {
        List {
            Section {
                Text("Development connection: agent conversations are real, but original OpenDuet Bot identities and production sign-in are not connected yet.")
                    .font(.caption).foregroundStyle(.secondary)
                if let setupError { Text(setupError).foregroundStyle(.secondary) }
                if let model {
                    Text(status(model.phase)).font(.subheadline)
                    if model.hasSession { Text(model.liveStatus).font(.caption).foregroundStyle(.secondary) }
                    if model.verificationMode == "fixture" { Text("Local test provider — no model inference").font(.caption).foregroundStyle(.orange) }
                    if model.hasPending {
                        Button("Resolve unsent requests") { Task { await model.resolvePending() } }.disabled(model.isBusy)
                        Text("Checks delivery and cancels unreceived requests. Uncertain effects stay blocked; nothing is replayed.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let failure = model.gatewayFailure { Text(failure.message).foregroundStyle(.secondary) }
                    if let error = model.errorMessage { Text(error).foregroundStyle(.red) }
                    if model.isBusy { ProgressView("Connecting…") }
                    Button("Refresh session") { Task { await model.refresh(); await model.loadHistory(); await model.loadSessions() } }.disabled(model.isBusy)
                }
            }
            if let model {
                if showsRoster && !model.sessions.isEmpty {
                    Section {
                        DisclosureGroup("Conversations") {
                            ForEach(model.sessions, id: \.sessionID) { session in
                                Button(session.title ?? "Conversation") { Task { await model.selectSession(session) } }
                            }
                        }
                    }
                }
                Section(model.hasSession ? "Continue the conversation" : "Start a conversation") {
                    TextField("Ask Euphoria", text: $message, axis: .vertical)
                        .accessibilityIdentifier("gateway.message")
                    Button(model.hasSession ? "Send message" : "Send request") {
                        let input = message
                        message = "" // Never leave the exact request armed for an accidental duplicate tap.
                        Task { await model.send(message: input); await model.refresh(); await model.loadHistory(); await model.loadSessions() }
                    }
                    .disabled(model.isBusy || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if model.hasSession {
                    Section {
                        Button("Stop agent") { Task { await model.cancel(); await model.refresh(); await model.loadHistory() } }.disabled(model.isBusy)
                        Button("New conversation") { model.newConversation(); message = "" }.disabled(model.isBusy)
                    }
                }
                if let state = model.state {
                    VisualNodesView(state: state) { node, kind, values in model.enact(node, kind: kind, values: values) }
                        .disabled(model.isBusy || model.phase == "uncertain")
                }
                ConversationHistoryView(archive: model.conversation, error: model.historyError) {
                    Task { await model.loadHistory(more: true) }
                }
            }
        }
        .navigationTitle("Chat")
        #if DEBUG
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                Button("Development tools", systemImage: "hammer") { showsDevelopmentTools = true }
            }
        }
        .sheet(isPresented: $showsDevelopmentTools) { DevelopmentToolsView() }
        #endif
        .task(id: scenePhase == .active ? model?.liveSessionID : nil) {
            if scenePhase == .active { await model?.followCurrentSession() }
        }
        .task(id: "\(model?.state?.surface.revision ?? -1):\(model?.isBusy ?? false)") { model?.acknowledgeDisplayedSurface() }
        .task {
            if model == nil { configure() }
            await model?.restore()
            await model?.loadHistory()
            await model?.loadSessions()
        }
    }
    private func configure() {
        #if DEBUG
        do { model = try GatewaySessionModel.configured(context: context) }
        catch { setupError = "No gateway configured for this Debug build. The offline fixtures remain available." }
        #else
        setupError = "Gateway connection proof is available in Debug builds only."
        #endif
    }
    private func status(_ phase: String) -> String {
        switch phase {
        case "ready": return "Ready for a request"
        case "waiting": return "Waiting for your response"
        case "accepted": return "Response accepted; following the agent"
        case "uncertain": return "Outcome uncertain. Pending actions will not be replayed."
        case "in_progress": return "Agent session is in progress"
        case "idle": return "Agent session is idle"
        case "failed": return "Agent session failed"
        case "render_failed": return "The interface could not be generated"
        default: return "Session status: " + phase
        }
    }
}
