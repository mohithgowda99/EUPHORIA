import SwiftUI
import SwiftData

/// Internal source-service acceptance surface, not a substitute for
/// OpenDuet's full TasksScreen. Reads the real, authenticated /v1/tasks API.
/// The existing gateway remains owner, provider and action authority.
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
                Text("Source Tasks integration check. Real gateway Task IDs and statuses, not conversation session records. This is not the complete OpenDuet Tasks screen.")
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

/// Read-only source Task detail/report. Deliberately offers no write controls
/// until a stable task action journal and task conversation UI are accepted.
@MainActor
private struct NativeTaskEvidenceView: View {
    let client: GatewayClient
    let taskID: String
    @State private var task: GatewayTask?
    @State private var report: GatewayTaskReport?
    @State private var error: String?
    @State private var loading = false

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
        .refreshable { await refresh() }
        .task(id: taskID) { await refresh() }
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
