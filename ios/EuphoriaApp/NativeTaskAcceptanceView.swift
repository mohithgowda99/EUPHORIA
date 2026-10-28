import SwiftUI
import SwiftData

/// Real owner-scoped task records, distinct from provider session history.
/// This is a transitional native Tasks view, pending the original OpenDuet
/// TaskStore, Bot identity, Up Next, retry, and source navigation migration.
/// All actions remain server-authorized and journaled; no fake task state.
@MainActor
struct NativeTaskAcceptanceView: View {
    @Environment(\.modelContext) private var context
    @State private var transport: GatewayClient?
    @State private var tasks: [GatewayTask] = []
    @State private var cursor: String?
    @State private var hasMore = false
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Real task records and reports. Up Next, Bot assignments and source TaskStore migration are not yet available on this connection.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Try again") { Task { await refresh() } }
                }
            }
            if let transport {
                Section("Tasks") {
                    ForEach(tasks) { task in
                        NavigationLink {
                            NativeTaskEvidenceView(client: transport, taskID: task.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.title)
                                Text(statusLabel(task.status))
                                    .font(.caption).foregroundStyle(.secondary)
                                if task.deliveryPhase == "uncertain" {
                                    Text("Provider delivery uncertain")
                                        .font(.caption).foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                    if tasks.isEmpty && !loading && error == nil {
                        ContentUnavailableView("No tasks", systemImage: "checklist",
                            description: Text("No owned Task records were returned by the server."))
                    }
                    if hasMore {
                        Button("Load more") { Task { await loadMore() } }
                            .disabled(loading)
                    }
                }
            }
            if loading { ProgressView("Loading real tasks…") }
        }
        .navigationTitle("Tasks service")
        .refreshable { await refresh() }
        .task {
            guard transport == nil else { return }
            do {
                let model = try GatewaySessionModel.configured(context: context)
                transport = model.taskServiceClient
                await refresh()
            } catch {
                self.error = "An authenticated development gateway is required to read tasks."
            }
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "needs_input": return "Needs input"
        case "working": return "Working"
        case "resolved": return "Marked done"
        case "failed": return "Couldn't finish"
        case "ready_for_review": return "Ready for review"
        default: return "Unavailable"
        }
    }

    private func refresh() async {
        guard let transport, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await transport.listTasks()
            tasks = page.tasks
            cursor = page.nextCursor
            hasMore = page.hasMore
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadMore() async {
        guard let transport, !loading, hasMore, let cursor else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await transport.listTasks(after: cursor)
            let seen = Set(tasks.map(\.id))
            tasks.append(contentsOf: page.tasks.filter { !seen.contains($0.id) })
            self.cursor = page.nextCursor
            hasMore = page.hasMore
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Task detail and existing durable conversation route. Reply and cancel are
/// performed by GatewaySessionModel's existing persisted input journal; we do
/// not add a second task mutation path for those external operations.
@MainActor
private struct NativeTaskEvidenceView: View {
    @Environment(\.modelContext) private var context
    let client: GatewayClient
    let taskID: String
    @State private var task: GatewayTask?
    @State private var report: GatewayTaskReport?
    @State private var error: String?
    @State private var loading = false
    @State private var actionInFlight = false
    @State private var conversationInFlight = false
    @State private var showsConversation = false
    @State private var conversationModel: GatewaySessionModel?

    var body: some View {
        List {
            if let task {
                Section("Task") {
                    Text(task.title).font(.headline)
                    Text(task.instruction)
                    LabeledContent("Status", value: task.status.replacingOccurrences(of: "_", with: " "))
                    if let reason = task.failure { Text(reason).foregroundStyle(.secondary) }
                    if task.deliveryPhase == "uncertain" {
                        Text("Delivery is uncertain; this view never resends actions.")
                            .foregroundStyle(.orange)
                    }
                }
                Section("Actions") {
                    if task.sessionID != nil {
                        Button("Open task conversation") { Task { await openTaskConversation() } }
                            .disabled(conversationInFlight || actionInFlight)
                        if conversationInFlight { ProgressView("Opening saved conversation…") }
                        Text("Reply, stop, review generated UI and respond to the agent through the existing durable conversation journal.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Button(task.status == "resolved" ? "Reopen task" : "Mark as done") {
                        Task { await setResolved(task.status != "resolved") }
                    }
                    .disabled(actionInFlight || task.deliveryPhase == "uncertain")
                    Text("Marking done is your review decision; it does not execute or certify an external action.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let report {
                Section("Actual task conversation") {
                    if report.messages.isEmpty {
                        Text("No saved messages yet.").foregroundStyle(.secondary)
                    }
                    ForEach(report.messages) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.role == "user" ? "You" : "Bot")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(entry.text)
                                .textSelection(.enabled)
                        }
                    }
                    if report.historyHasMore {
                        Text("Older report pages require explicit source pagination.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let error {
                Text(error).foregroundStyle(.red)
                Button("Retry read") { Task { await refresh() } }
            }
            if loading { ProgressView("Reading task evidence…") }
        }
        .navigationTitle("Task detail")
        .navigationDestination(isPresented: $showsConversation) {
            if let conversationModel { GatewaySessionView(model: conversationModel) }
        }
        .onChange(of: showsConversation) { _, isOpen in
            if !isOpen { Task { await refresh() } }
        }
        .refreshable { await refresh() }
        .task(id: taskID) { await refresh() }
    }

    private func openTaskConversation() async {
        guard !conversationInFlight, let sessionID = task?.sessionID else { return }
        conversationInFlight = true
        defer { conversationInFlight = false }
        do {
            // Recover the exact task-owned session. A new session must never
            // be silently created when an older task conversation is opened.
            let envelope = try await client.refresh(sessionID: sessionID)
            guard envelope.sessionID == sessionID else { throw GatewayClientError.invalidResponse }
            let model = try GatewaySessionModel.configured(context: context)
            await model.selectSession(envelope)
            guard model.liveSessionID == sessionID else { throw GatewayClientError.invalidResponse }
            conversationModel = model
            error = nil
            showsConversation = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setResolved(_ resolved: Bool) async {
        guard !actionInFlight, task != nil else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            let result = try await client.setTaskResolved(id: taskID, resolved: resolved)
            guard result.task.id == taskID else { throw GatewayClientError.invalidResponse }
            task = result.task
            error = nil
        } catch {
            // An unknown reply is not success. Refresh reads the authoritative
            // row, and the button never blindly retransmits this write.
            self.error = "Could not confirm the review change. Refresh the task before taking another action."
        }
    }

    private func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let detail = try await client.task(id: taskID)
            guard detail.task.id == taskID else { throw GatewayClientError.invalidResponse }
            task = detail.task
            if detail.task.sessionID != nil {
                let evidence = try await client.taskReport(id: taskID)
                guard evidence.report.task.id == taskID else {
                    throw GatewayClientError.invalidResponse
                }
                report = evidence.report
            } else {
                report = nil
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
