import SwiftUI
import SwiftData

/// Original OpenDuet Tasks, not the transitional /v1/sessions or /v1/tasks
/// catalog. The source TaskStore owns identity, Bot, channel, status and report.
struct SourceTasksView: View {
    @Environment(\.modelContext) private var context
    @Query private var allCreations: [SourceTaskCreationIntent]
    @State private var client: OpenDuetSourceAPI?
    @State private var ownerScope: String?
    @State private var tasks: [SourceTask] = []
    @State private var suggestions: [SourceSuggestion] = []
    @State private var uncertainSuggestionIDs: Set<String> = []
    @State private var bots: [SourceBot] = []
    @State private var loading = false
    @State private var error: String?
    @State private var showingCreate = false
    @State private var pendingClear = false
    @State private var chosenBotID = ""
    @State private var title = ""
    @State private var instruction = ""

    private let statusOrder = ["needs_input", "working", "ready_for_review", "failed", "resolved"]
    private var uncertain: [SourceTaskCreationIntent] {
        allCreations.filter { $0.ownerScope == ownerScope }
    }

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh original tasks") { Task { await reload() } }
                }
            }
            if client == nil {
                Section {
                    Text("Sign in through Bots to access your original OpenDuet task service.")
                        .foregroundStyle(.secondary)
                    #if DEBUG
                    NavigationLink("Development Agents task adapter") { NativeTaskAcceptanceView() }
                    #endif
                }
            } else {
                if !uncertain.isEmpty {
                    Section("Task creation needs review") {
                        ForEach(uncertain) { request in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(request.title)
                                Text("The original task intake does not accept a client idempotency key. Check the original Tasks list before doing anything else; this request will not be sent again automatically.")
                                    .font(.caption).foregroundStyle(.secondary)
                                Button("I have checked the source list", role: .destructive) { pendingClear = true }
                            }
                        }
                    }
                }
                let upNext = suggestions.filter { $0.status == "open" }
                if !upNext.isEmpty {
                    Section("Up Next") {
                        ForEach(upNext) { suggestion in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(suggestion.title).font(.headline)
                                Text(suggestion.detail).font(.subheadline).foregroundStyle(.secondary)
                                if let source = suggestion.sourceApp {
                                    Text(source).font(.caption).foregroundStyle(.secondary)
                                }
                                HStack {
                                    Button("Start") { Task { await changeSuggestion(suggestion.id, start: true) } }
                                        .disabled(loading || uncertainSuggestionIDs.contains(suggestion.id))
                                    Spacer()
                                    Button("Hide") { Task { await changeSuggestion(suggestion.id, start: false) } }
                                        .disabled(loading || uncertainSuggestionIDs.contains(suggestion.id))
                                }
                                if uncertainSuggestionIDs.contains(suggestion.id) {
                                    Text("Outcome uncertain. Refresh Up Next before repeating this action.")
                                        .font(.caption).foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                }
                ForEach(statusOrder, id: \.self) { status in
                    let items = tasks.filter { $0.status == status }
                    if !items.isEmpty {
                        Section(title(for: status)) {
                            ForEach(items) { item in
                                NavigationLink {
                                    if let client, let ownerScope {
                                        SourceTaskDetailView(client: client, ownerScope: ownerScope, taskID: item.id)
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(item.title).font(.headline)
                                        if let next = item.next, !next.isEmpty {
                                            Text(next).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        if let reason = item.failure, !reason.isEmpty {
                                            Text(reason).font(.caption).foregroundStyle(.orange)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if tasks.isEmpty && !loading && error == nil {
                    ContentUnavailableView("No Tasks", systemImage: "checklist",
                        description: Text("Ask a Bot to take on work, or create a task."))
                }
            }
            if loading { ProgressView("Reading original OpenDuet Tasks…") }
        }
        .navigationTitle("Tasks")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New task", systemImage: "plus") {
                    chosenBotID = bots.first?.id ?? ""
                    showingCreate = true
                }
                .disabled(client == nil || bots.isEmpty || loading || !uncertain.isEmpty)
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                Form {
                    Picker("Bot", selection: $chosenBotID) {
                        ForEach(bots.filter { !$0.hidden }, id: \.id) { bot in
                            Text(bot.name).tag(bot.id)
                        }
                    }
                    TextField("Task title", text: $title)
                    TextField("What should the Bot do?", text: $instruction, axis: .vertical)
                        .lineLimit(3...8)
                    Text("The original OpenDuet task service creates a separate conversation for each task.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .navigationTitle("Start task")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showingCreate = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Start") { showingCreate = false; Task { await create() } }
                            .disabled(chosenBotID.isEmpty || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                      instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                      title.count > 160 || instruction.count > 4000)
                    }
                }
            }
        }
        .confirmationDialog("Clear the saved creation warning?", isPresented: $pendingClear,
            titleVisibility: .visible) {
            Button("I verified it in original Tasks", role: .destructive) {
                for item in uncertain { context.delete(item) }
                do { try context.save() }
                catch { self.error = "Could not save the cleared warning; nothing was sent." }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Only clear after checking whether the original OpenDuet server created this task. Clearing does not cancel or create a task.")
        }
        .refreshable { await reload() }
        .onAppear { Task { await reload() } }
    }

    private func title(for status: String) -> String {
        switch status {
        case "needs_input": return "Needs Input"
        case "working": return "Working"
        case "ready_for_review": return "Ready for Review"
        case "failed": return "Couldn't Finish"
        case "resolved": return "Resolved"
        default: return "Tasks"
        }
    }

    private func reload() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let service = try SavedOpenDuetAccount.client()
            let account = try await service.sourceSession()
            let fresh = try await service.sourceTasks()
            let next = try await service.sourceSuggestions()
            let roster = try await service.bots()
            ownerScope = service.endpoint.baseURL.absoluteString + ":" + account.user.id
            client = service
            tasks = fresh
            suggestions = next
            uncertainSuggestionIDs = []
            bots = roster
            self.error = nil
        } catch {
            client = nil
            self.error = "Original Tasks cannot be loaded. Sign in through Bots or check the OpenDuet server."
        }
    }

    private func changeSuggestion(_ id: String, start: Bool) async {
        guard !loading, let client, !uncertainSuggestionIDs.contains(id) else { return }
        loading = true
        defer { loading = false }
        do {
            if start {
                let result = try await client.startSourceSuggestion(id: id)
                guard result.suggestion.id == id else { throw SourceAPIError.invalidResponse }
            } else {
                let result = try await client.dismissSourceSuggestion(id: id)
                guard result.id == id else { throw SourceAPIError.invalidResponse }
            }
            suggestions = try await client.sourceSuggestions()
            tasks = try await client.sourceTasks()
            self.error = nil
        } catch {
            uncertainSuggestionIDs.insert(id)
            self.error = "Up Next action could not be confirmed. Refresh the original cards before trying again."
        }
    }

    private func create() async {
        guard !loading, let client, let ownerScope, uncertain.isEmpty else { return }
        loading = true
        defer { loading = false }
        let draft = SourceTaskCreationIntent(ownerScope: ownerScope, botID: chosenBotID,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            instruction: instruction.trimmingCharacters(in: .whitespacesAndNewlines))
        do {
            context.insert(draft)
            try context.save() // Save intent BEFORE the non-idempotent source POST.
            let created = try await client.createSourceTask(botID: draft.botID,
                title: draft.title, instruction: draft.instruction)
            guard !created.id.isEmpty else { throw SourceAPIError.invalidResponse }
            context.delete(draft)
            try context.save()
            tasks = try await client.sourceTasks()
            title = ""; instruction = ""
            self.error = nil
        } catch {
            self.error = "Task creation was not confirmed. Review the original Tasks list; the request will not be retransmitted."
        }
    }
}

/// Native original task detail and task report. Source approval/question policy
/// and the original task conversation remain authoritative.
struct SourceTaskDetailView: View {
    @Environment(\.modelContext) private var context
    @Query private var allPending: [SourceMessageIntent]
    let client: OpenDuetSourceAPI
    let ownerScope: String
    let taskID: String
    @State private var task: SourceTask?
    @State private var report: SourceTaskReport?
    @State private var channel: SourceConversation?
    @State private var reply = ""
    @State private var loading = false
    @State private var error: String?
    @State private var lastReplyAccepted = false

    private var pending: [SourceMessageIntent] {
        allPending.filter { $0.ownerScope == ownerScope && $0.channelID == "task_reply:" + taskID }
    }

    var body: some View {
        List {
            if let task {
                Section("Task") {
                    Text(task.title).font(.headline)
                    if let why = task.why { Text(why).foregroundStyle(.secondary) }
                    LabeledContent("Status", value: task.status.replacingOccurrences(of: "_", with: " "))
                    if let next = task.next { Text(next) }
                    if let failure = task.failure { Text(failure).foregroundStyle(.orange) }
                }
                Section("Actions") {
                    if let channel {
                        NavigationLink("Task conversation") {
                            SourceConversationDetailView(client: client, ownerScope: ownerScope, conversation: channel, allowsSending: false)
                        }
                    }
                    if task.status == "needs_input" {
                        NavigationLink("Answer questions and review approvals") { SourceApprovalsView() }
                    }
                    Button(task.status == "resolved" ? "Reopen task" : "Mark done") {
                        Task { await resolve(task.status != "resolved") }
                    }
                    .disabled(loading)
                    Text("Marking done is your review decision. It does not certify an external effect.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if task.status != "resolved" {
                    Section("Reply to task") {
                        TextField("Continue this task", text: $reply, axis: .vertical).lineLimit(2...6)
                        Button("Send reply") { Task { await sendReply() } }
                            .disabled(loading || !pending.isEmpty ||
                                      reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if lastReplyAccepted {
                            Text("Reply queued in OpenDuet; execution may still be underway.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !pending.isEmpty {
                Section("Unconfirmed reply") {
                    ForEach(pending) { item in
                        Text(item.message)
                        Button("Check same saved reply") { Task { await resend(item) } }.disabled(loading)
                    }
                }
            }
            if let report {
                Section("Report") {
                    ForEach(report.entries) { entry in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(entry.kind.capitalized).font(.caption).foregroundStyle(.secondary)
                            if let text = entry.text { Text(text).textSelection(.enabled) }
                            if let decision = entry.decision { Text("Human decision: " + decision) }
                            if let at = entry.at { Text(at).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    ForEach(report.resources) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title ?? item.subject ?? item.kind)
                            if let from = item.from { Text(from).font(.caption).foregroundStyle(.secondary) }
                            if let link = item.link, let url = URL(string: link),
                               ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                                Link("Open source", destination: url)
                            }
                        }
                    }
                    if report.entries.isEmpty && report.resources.isEmpty {
                        Text("No report entries yet.").foregroundStyle(.secondary)
                    }
                }
            }
            if let error {
                Text(error).foregroundStyle(.red)
                Button("Retry read") { Task { await load() } }.disabled(loading)
            }
            if loading { ProgressView("Reading task evidence…") }
        }
        .navigationTitle("Task")
        .refreshable { await load() }
        .task(id: taskID) { await load() }
    }

    private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let actual = try await client.sourceTask(id: taskID)
            let summary = try await client.sourceTaskReport(id: taskID)
            task = actual
            report = summary
            channel = try? await client.sourceConversation(id: actual.channelId)
            self.error = nil
        } catch {
            self.error = "The original task detail or report could not be verified. Previously loaded data remains unchanged."
        }
    }

    private func resolve(_ done: Bool) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            task = try await client.sourceSetTaskResolved(id: taskID, resolved: done)
            report = try? await client.sourceTaskReport(id: taskID)
            self.error = nil
        } catch { self.error = "Review change uncertain. Refresh task status before trying again." }
    }

    private func sendReply() async {
        guard !loading, pending.isEmpty, let task else { return }
        let text = reply
        let saved = SourceMessageIntent(ownerScope: ownerScope, channelID: "task_reply:" + taskID,
            botID: task.botId, externalID: UUID().uuidString, message: text)
        loading = true
        defer { loading = false }
        do {
            context.insert(saved)
            try context.save()
            self.task = try await client.sourceTaskReply(id: taskID,
                message: saved.message, messageID: saved.externalID)
            context.delete(saved)
            try context.save()
            reply = ""
            lastReplyAccepted = true
            report = try? await client.sourceTaskReport(id: taskID)
            self.error = nil
        } catch {
            self.error = "Reply delivery may be pending. The saved message ID must be reused; do not send a new reply."
        }
    }

    private func resend(_ item: SourceMessageIntent) async {
        guard !loading, item.ownerScope == ownerScope, item.channelID == "task_reply:" + taskID else { return }
        loading = true
        defer { loading = false }
        do {
            task = try await client.sourceTaskReply(id: taskID,
                message: item.message, messageID: item.externalID)
            context.delete(item)
            try context.save()
            lastReplyAccepted = true
            report = try? await client.sourceTaskReport(id: taskID)
            self.error = nil
        } catch { self.error = "Source task reply outcome is still uncertain. No new message ID was created." }
    }
}
