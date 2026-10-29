import SwiftUI
import QuickLook
import UniformTypeIdentifiers
import SwiftData

/// OpenDuet's actual Chat roster. The ORIGINAL ChannelStore and DeliveryRouter
/// are authoritative. This is not the transitional gateway's session list.
struct SourceConversationsHomeView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var ownerScope: String?
    @State private var conversations: [SourceConversation] = []
    @State private var cursor: String?
    @State private var bots: [SourceBot] = []
    @State private var loading = false
    @State private var creating = false
    @State private var error: String?
    @State private var choosingBot = false
    @State private var createdConversation: SourceConversation?
    @State private var opensCreatedConversation = false

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    Button("Try again") { Task { await refresh() } }
                }
            }
            if client == nil {
                Section {
                    Text("Connect your original OpenDuet account from the Bots tab to open source-backed conversations.")
                        .foregroundStyle(.secondary)
                    #if DEBUG
                    NavigationLink("Development Agents gateway") { GatewaySessionView() }
                    #endif
                }
            } else {
                Section("Conversations") {
                    ForEach(conversations) { conversation in
                        NavigationLink {
                            if let client, let ownerScope {
                                SourceConversationDetailView(client: client, ownerScope: ownerScope,
                                    conversation: conversation)
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(conversation.name.isEmpty ? "Conversation" : conversation.name)
                                Text(conversation.agentIds.count == 1 ? "One Bot" : "\(conversation.agentIds.count) Bots")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if conversations.isEmpty && !loading && error == nil {
                        ContentUnavailableView("No conversations", systemImage: "bubble.left",
                            description: Text("Start a conversation with one of your Bots."))
                    }
                    if let cursor {
                        Button("Older conversations") { Task { await loadMore(cursor: cursor) } }
                            .disabled(loading)
                    }
                }
            }
            if loading { ProgressView("Loading original OpenDuet conversations…") }
        }
        .navigationTitle("Chat")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New conversation", systemImage: "plus") { choosingBot = true }
                    .disabled(client == nil || bots.isEmpty || creating)
            }
        }
        .confirmationDialog("Choose a Bot", isPresented: $choosingBot, titleVisibility: .visible) {
            ForEach(bots) { bot in
                Button(bot.name) { Task { await startConversation(botID: bot.id) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("OpenDuet creates a real, owned channel for the selected Bot.")
        }
        .navigationDestination(isPresented: $opensCreatedConversation) {
            if let client, let ownerScope, let createdConversation {
                SourceConversationDetailView(client: client, ownerScope: ownerScope, conversation: createdConversation)
            }
        }
        .refreshable { await refresh() }
        .onAppear { Task { await refresh() } }
    }

    private func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            let user = try await source.sourceSession().user
            let page = try await source.sourceConversations()
            let reachable = try await source.bots()
            client = source
            ownerScope = source.endpoint.baseURL.absoluteString + ":" + user.id
            conversations = page.conversations
            cursor = page.nextCursor
            bots = reachable.filter { !$0.hidden }
            self.error = nil
        } catch {
            client = nil
            self.error = "Source Chat is unavailable. Sign in through Bots or check your OpenDuet deployment."
        }
    }
    private func loadMore(cursor: String) async {
        guard !loading, let client else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await client.sourceConversations(cursor: cursor)
            let found = Set(conversations.map(\.id))
            conversations += page.conversations.filter { !found.contains($0.id) }
            self.cursor = page.nextCursor
            self.error = nil
        } catch { self.error = "Older conversations could not be loaded." }
    }
    private func startConversation(botID: String) async {
        guard !creating, let client else { return }
        creating = true
        defer { creating = false }
        do {
            let created = try await client.createSourceConversation(withBot: botID)
            conversations = try await client.sourceConversations().conversations
            createdConversation = created
            opensCreatedConversation = true
            self.error = nil
        } catch {
            // A lost response can have created a channel. Never blindly create
            // another; refresh the original source roster to reconcile.
            self.error = "Channel creation could not be confirmed. Refresh the roster before creating another."
        }
    }
}

/// The source DeliveryStore already deduplicates native messages by externalID.
/// Only the outbound submission identity is archived on-device before sending.
struct SourceConversationDetailView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.modelContext) private var context
    @Query private var allPending: [SourceMessageIntent]
    let client: OpenDuetSourceAPI
    let ownerScope: String
    let conversation: SourceConversation
    var allowsSending = true
    @State private var selectedBotID = ""
    @State private var messages: [SourceConversationText] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var error: String?
    @State private var lastSendAccepted = false
    @State private var visual: VisualState?
    @State private var awaitingAgent = false
    @State private var needsHumanAnswer = false
    @State private var visualCompleted = false
    @State private var completedVisuals: [SourceCompletedVisual] = []
    @State private var browserApprovals: [SourceBrowserApproval] = []
    @State private var pendingBrowserAllowID: String?
    @State private var browserDecisionBusy = false
    @State private var hostedActivity: SourceHostedActivity?
    @State private var confirmingHostedCancel = false
    @State private var cancelNotice: String?
    @State private var hostedArtifacts: [SourceHostedArtifact] = []
    @State private var subagents: [SourceHostedSubagent] = []
    @State private var delegationActivity: SourceDelegationActivity?
    @State private var uploadReconciliations: [String: SourceHostedUploadStatus] = [:]
    @State private var exportedArtifact: (id: String, url: URL)?
    @State private var previewURL: URL?
    @State private var downloadingArtifactID: String?
    @State private var selectingInputFile = false
    @State private var preparingInputFile = false
    @State private var inputUploadNotice: String?

    private var pending: [SourceMessageIntent] {
        allPending.filter { $0.ownerScope == ownerScope && $0.channelID == conversation.id }
    }
    private var unconfirmedUploads: [SourceMessageIntent] {
        allPending.filter { $0.ownerScope == ownerScope &&
            $0.channelID == "hosted_upload:" + conversation.id && $0.botID == selectedBotID }
    }

    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var composing: Bool
    private var waitingForHuman: Bool { needsHumanAnswer || (visual != nil && visual?.requiresDisplayReceipt == false && visual?.pending.isEmpty == true) }
    private var surfaceColor: Color { colorScheme == .dark ? Color(red: 17/255, green: 17/255, blue: 19/255) : Color(red: 246/255, green: 246/255, blue: 248/255) }
    private var userColor: Color { colorScheme == .dark ? Color(red: 47/255, green: 40/255, blue: 69/255) : Color(red: 231/255, green: 227/255, blue: 247/255) }
    private var botColor: Color { colorScheme == .dark ? Color(red: 38/255, green: 38/255, blue: 43/255) : Color(red: 236/255, green: 236/255, blue: 240/255) }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                SourceDuetPresence(working: awaitingAgent && !waitingForHuman, drafting: !draft.isEmpty, blocked: error != nil)
                    .frame(width: 68, height: 68)
                if needsHumanAnswer {
                    NavigationLink("Answer your Bot in Approvals") { SourceApprovalsView() }
                        .font(.subheadline)
                } else if waitingForHuman {
                    Text("Your choice").font(.subheadline).foregroundStyle(.secondary)
                }
                else if awaitingAgent { Text("Thinking…").font(.subheadline).foregroundStyle(.secondary) }
                if let activity = hostedActivity, awaitingAgent || activity.cancelRequested {
                    if activity.canCancel && !activity.cancelRequested {
                        Button("Stop this Bot run", role: .destructive) {
                            confirmingHostedCancel = true
                        }
                        .font(.subheadline)
                        .disabled(busy)
                    } else if activity.cancelRequested {
                        Text(activity.outcomeUncertain == true
                             ? "Stop request outcome uncertain. Refresh before taking further action."
                             : "Stop requested. Waiting for the provider to confirm the turn ended.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let cancelNotice {
                    Text(cancelNotice).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.bottom, 8)
            ScrollViewReader { scroll in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        if conversation.agentIds.count > 1 {
                            Picker("Talk to", selection: $selectedBotID) {
                                ForEach(conversation.agentIds, id: \.self) { Text($0).tag($0) }
                            }.pickerStyle(.menu)
                        }
                        ForEach(messages) { message in
                            HStack {
                                if message.role == "user" { Spacer(minLength: 44) }
                                VStack(alignment: .leading, spacing: 6) {
                                    if !message.text.isEmpty { Text(message.text).font(.body).textSelection(.enabled) }
                                    if message.unsupportedContent {
                                        Text("Some source content is not supported yet.").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .background(message.role == "user" ? userColor : botColor, in: RoundedRectangle(cornerRadius: 20))
                                if message.role != "user" { Spacer(minLength: 44) }
                            }.id(message.id)
                            ForEach(completedVisuals.filter { $0.afterMessageID == message.id }, id: \.surface.surfaceID) { saved in
                                VStack(alignment: .leading, spacing: 12) {
                                    SourceCompletedVisualReceipt(saved: saved, state: restoredVisual(saved.surface))
                                }.padding(16)
                                    .background(botColor, in: RoundedRectangle(cornerRadius: 20))
                            }
                        }
                        if let visual {
                            VStack(alignment: .leading, spacing: 12) {
                                VisualNodesView(state: visual, onAction: enactVisual).disabled(visualCompleted)
                            }.padding(16)
                                .background(botColor, in: RoundedRectangle(cornerRadius: 20))
                                .onAppear {
                                    if !visualCompleted, visual.requiresDisplayReceipt, let first = visual.surface.nodes.first {
                                        enactVisual(first, kind: .displayed, values: [:])
                                    }
                                }
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                        if let error {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Couldn’t finish", systemImage: "exclamationmark.circle")
                                    .font(.subheadline.weight(.semibold))
                                Text(error).font(.subheadline)
                                Button("Check status") { Task { await reload() } }.buttonStyle(.bordered)
                            }
                            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
                            .accessibilityElement(children: .contain)
                        }
                        if !browserApprovals.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Browser access requests", systemImage: "globe")
                                    .font(.subheadline.weight(.semibold))
                                Text("OpenAI hosts the browser. Grant access only to these public documentation origins. Website writes are not authorized.")
                                    .font(.caption).foregroundStyle(.secondary)
                                ForEach(browserApprovals) { request in
                                    VStack(alignment: .leading, spacing: 7) {
                                        Text(request.kind == "authentication" ? "Sign-in blocked" : (request.origin ?? "Unknown origin"))
                                            .font(.subheadline.weight(.medium)).textSelection(.enabled)
                                        if let reason = request.reason { Text(reason).font(.caption).foregroundStyle(.secondary) }
                                        if request.submitted {
                                            Text(request.uncertain ? "Decision outcome uncertain. Refresh status." : "Decision submitted.")
                                                .font(.caption).foregroundStyle(.secondary)
                                        } else {
                                            HStack(spacing: 14) {
                                                if request.kind == "origin" && request.canApprove {
                                                    Button("Allow origin") { pendingBrowserAllowID = request.id }
                                                }
                                                Button(request.kind == "authentication" ? "Cancel sign-in" : "Deny access") {
                                                    Task { await decideBrowser(request, decision:
                                                        request.kind == "authentication" ? "cancel" : "deny") }
                                                }
                                            }.disabled(browserDecisionBusy || busy)
                                        }
                                    }.padding(10).background(botColor.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
                                }
                            }.padding(12).background(botColor, in: RoundedRectangle(cornerRadius: 16))
                        }
                        if let activity = delegationActivity, !activity.events.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Delegation activity", systemImage: "list.bullet.rectangle")
                                    .font(.subheadline.weight(.semibold))
                                Text(activity.complete ? "Original task and provider root completed" :
                                     "Coordinator status: " + (activity.providerStatus ?? "unconfirmed"))
                                    .font(.caption).foregroundStyle(.secondary)
                                ForEach(Array(activity.events.enumerated()), id: \.offset) { _, action in
                                    HStack {
                                        Text(action.type.replacingOccurrences(of: "_", with: " "))
                                            .font(.caption)
                                        Spacer()
                                        Text(action.status ?? "unknown")
                                            .font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }.padding(12).background(botColor, in: RoundedRectangle(cornerRadius: 16))
                        }
                        if !subagents.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Delegated workers", systemImage: "person.2.crop.square.stack")
                                    .font(.subheadline.weight(.semibold))
                                ForEach(subagents) { agent in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(agent.name ?? "Delegated worker")
                                                .font(.subheadline.weight(.medium))
                                            Text(agent.id)
                                                .font(.caption2).foregroundStyle(.tertiary)
                                        }
                                        Spacer()
                                        Label(agent.status == "active" ? "Active" : "Closed",
                                              systemImage: agent.status == "active" ?
                                              "circle.dotted.circle" : "checkmark.circle")
                                            .font(.caption)
                                    }
                                }
                                Text("These are real provider workers in this Bot's session. Active does not mean the task has finished.")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(12).background(botColor, in: RoundedRectangle(cornerRadius: 12))
                        }
                        if !unconfirmedUploads.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("File upload needs review", systemImage: "exclamationmark.triangle")
                                    .font(.subheadline.weight(.semibold))
                                ForEach(unconfirmedUploads) { item in
                                    Text(item.message)
                                    Text("The server may already have received this file. No automatic retry is allowed.")
                                        .font(.caption).foregroundStyle(.secondary)
                                    Button("Check OpenAI file inventory") {
                                        Task { await reconcileHostedUpload(item) }
                                    }.disabled(busy)
                                    if let record = uploadReconciliations[item.externalID] {
                                        Text(record.status == "confirmed" ? "Source receipt confirmed" :
                                             record.status == "present_unverified" ?
                                             "OpenAI reports matching path and size, but file contents cannot be verified." :
                                             "The provider has not confirmed the upload. Do not retry automatically.")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Button("I verified the file status") {
                                        context.delete(item)
                                        try? context.save()
                                    }.font(.caption)
                                }
                            }
                            .padding(12).background(botColor, in: RoundedRectangle(cornerRadius: 12))
                        }
                        if let inputUploadNotice {
                            Label(inputUploadNotice, systemImage: "doc.badge.plus")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if !hostedArtifacts.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Generated files", systemImage: "doc.zipper")
                                    .font(.subheadline.weight(.semibold))
                                Text("Files from completed, source-verified Bot turns. Downloading is private to your signed-in account.")
                                    .font(.caption).foregroundStyle(.secondary)
                                ForEach(hostedArtifacts) { artifact in
                                    VStack(alignment: .leading, spacing: 7) {
                                        Text(artifact.filename).font(.subheadline.weight(.medium))
                                        Text(artifact.mimeType + " · " +
                                             ByteCountFormatter.string(fromByteCount: Int64(artifact.sizeBytes), countStyle: .file))
                                            .font(.caption2).foregroundStyle(.secondary)
                                        if exportedArtifact?.id == artifact.id, let file = exportedArtifact?.url {
                                            HStack(spacing: 16) {
                                                if ["pdf","png","jpg","jpeg","txt","csv"].contains(file.pathExtension.lowercased()) {
                                                    Button { previewURL = file } label: {
                                                        Label("Preview", systemImage: "eye")
                                                    }
                                                }
                                                ShareLink(item: file) {
                                                    Label("Save or share", systemImage: "square.and.arrow.up")
                                                }
                                            }
                                        } else {
                                            Button {
                                                Task { await download(artifact) }
                                            } label: {
                                                if downloadingArtifactID == artifact.id {
                                                    ProgressView()
                                                } else {
                                                    Label("Prepare file", systemImage: "arrow.down.doc")
                                                }
                                            }
                                            .disabled(downloadingArtifactID != nil)
                                        }
                                    }
                                    .padding(12)
                                    .background(botColor, in: RoundedRectangle(cornerRadius: 12))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(pending) { item in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Delivery not confirmed").font(.subheadline.weight(.semibold))
                                Text(item.message).font(.subheadline)
                                Button("Check saved submission") { Task { await resend(item) } }.disabled(busy)
                            }.padding(16).background(botColor, in: RoundedRectangle(cornerRadius: 20))
                        }
                    }
                    .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.count) { previous, current in
                    if previous > 0, current > previous, let id = messages.last?.id {
                        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)) { scroll.scrollTo(id, anchor: .bottom) }
                    }
                }
            }
        }
        .background(surfaceColor)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if allowsSending {
                HStack(alignment: .bottom, spacing: 12) {
                    Button {
                        selectingInputFile = true
                    } label: {
                        if preparingInputFile {
                            ProgressView()
                        } else {
                            Image(systemName: "paperclip")
                                .font(.body.weight(.medium))
                        }
                    }
                    .accessibilityLabel("Add file to Bot sandbox")
                    .disabled(busy || preparingInputFile || !unconfirmedUploads.isEmpty ||
                              !pending.isEmpty || selectedBotID.isEmpty)
                    TextField("Message OpenDuet", text: $draft, axis: .vertical)
                        .lineLimit(1...6).focused($composing)
                        .padding(.vertical, 12).padding(.leading, 16)
                    Button { composing = false; Task { await send() } } label: {
                        Image(systemName: "arrow.up").font(.body.weight(.semibold))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.borderedProminent).tint(.primary)
                    .clipShape(Circle()).accessibilityLabel("Send")
                    .disabled(busy || awaitingAgent || !pending.isEmpty || selectedBotID.isEmpty || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(6).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28))
                .overlay(RoundedRectangle(cornerRadius: 28).stroke(.primary.opacity(0.08), lineWidth: 0.5))
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(surfaceColor.opacity(0.96))
            }
        }
        .confirmationDialog("Allow this public documentation website?", isPresented: Binding(
            get: { pendingBrowserAllowID != nil },
            set: { if !$0 { pendingBrowserAllowID = nil } }
        ), titleVisibility: .visible) {
            Button("Allow this origin") {
                guard let id = pendingBrowserAllowID,
                      let request = browserApprovals.first(where: { $0.id == id && $0.canApprove }) else { return }
                pendingBrowserAllowID = nil
                Task { await decideBrowser(request, decision: "approve") }
            }
            Button("Cancel", role: .cancel) { pendingBrowserAllowID = nil }
        } message: {
            Text("This approves the displayed public website origin, not website writes or sign-in.")
        }
        .confirmationDialog("Stop this Bot's current hosted run?",
                            isPresented: $confirmingHostedCancel, titleVisibility: .visible) {
            Button("Request stop", role: .destructive) {
                Task { await stopCurrentHostedRun() }
            }
            Button("Keep running", role: .cancel) {}
        } message: {
            Text("A stop request is not instant. EUPHORIA keeps the original task and any completed results; it will not retry an uncertain cancellation.")
        }
        .quickLookPreview($previewURL)
        .fileImporter(isPresented: $selectingInputFile, allowedContentTypes: [.item]) { selection in
            switch selection {
            case .success(let file):
                Task { await prepareHostedInputFile(file) }
            case .failure:
                inputUploadNotice = "File picker closed without an accepted file."
            }
        }
        .animation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.2), value: visual?.surface.surfaceID)
        .navigationTitle(conversation.name.isEmpty ? "OpenDuet" : conversation.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .task {
            if selectedBotID.isEmpty { selectedBotID = conversation.agentIds.first ?? "" }
            await reload()
        }
        .onChange(of: selectedBotID) { _, _ in
            hostedActivity = nil
            browserApprovals = []
            pendingBrowserAllowID = nil
            cancelNotice = nil
            previewURL = nil
            hostedArtifacts = []
            subagents = []
            delegationActivity = nil
            uploadReconciliations = [:]
            if let previous = exportedArtifact?.url { try? FileManager.default.removeItem(at: previous) }
            exportedArtifact = nil
            inputUploadNotice = nil
            Task { await reload() }
        }
        .task(id: scenePhase == .active ? selectedBotID : "") {
            // The original server runs the Bot independently; the iPhone only
            // observes its saved channel history. Stop network reads when the
            // screen disappears or the app moves to background.
            guard scenePhase == .active, !selectedBotID.isEmpty else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(5)) }
                catch { return }
                guard !Task.isCancelled, scenePhase == .active else { return }
                if !busy { await reload() }
            }
        }
    }

    private func restoredVisual(_ surface: VisualSurface) -> VisualState {
        (try? VisualSnapshotRepository(context: context).load(surfaceID: surface.surfaceID)) ?? VisualState(surface: surface)
    }

    private func enactVisual(_ node: VisualNode, kind: VisualActionKind, values: [String: VisualScalar]) {
        guard var state = visual else { return }
        let action = VisualAction(id: UUID().uuidString, surfaceID: state.surface.surfaceID,
            expectedRevision: state.surface.revision, nodeID: node.id, kind: kind, values: values)
        do {
            try state.apply(action)
            try VisualSnapshotRepository(context: context).save(state)
            visual = state
            guard kind != .setField else { return }
            Task {
                do {
                    try await client.sourceVisualAction(channelID: conversation.id,
                        agentID: selectedBotID, action: action)
                    awaitingAgent = true
                    await reload()
                } catch {
                    self.error = "Response awaiting verification. Your saved selection will not be sent again automatically."
                }
            }
        } catch { self.error = "The selection could not be validated or saved." }
    }

    private func reload() async {
        guard !busy, !selectedBotID.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let channel = try await client.sourceConversation(id: conversation.id)
            guard channel.agentIds.contains(selectedBotID) else { throw SourceAPIError.invalidResponse }
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: selectedBotID)
            // Previous file links cannot carry authority across Bot switches.
            if exportedArtifact?.id != nil && !hostedArtifacts.contains(where: { $0.id == exportedArtifact?.id }) {
                exportedArtifact = nil
            }
            hostedActivity = try? await client.sourceHostedActivity(
                channelID: conversation.id, botID: selectedBotID)
            browserApprovals = (try? await client.sourceBrowserApprovals(
                channelID: conversation.id, botID: selectedBotID)) ?? []
            hostedArtifacts = (try? await client.sourceHostedArtifacts(channelID: conversation.id, botID: selectedBotID)) ?? []
            subagents = (try? await client.sourceHostedSubagents(channelID: conversation.id,
                                                                  botID: selectedBotID)) ?? []
            delegationActivity = try? await client.sourceDelegationActivity(
                channelID: conversation.id, botID: selectedBotID)
            if let exportedArtifact, !hostedArtifacts.contains(where: { $0.id == exportedArtifact.id }) {
                self.exportedArtifact = nil
            }
            self.error = nil
            do {
                let response = try await client.sourceVisual(channelID: conversation.id, agentID: selectedBotID)
                completedVisuals = response.completedSurfaces ?? []
                needsHumanAnswer = response.pendingQuestion == true
                visualCompleted = response.completed == true
                if response.deliveryState == "failed" || response.deliveryError != nil {
                    awaitingAgent = false
                    lastSendAccepted = false
                    self.error = response.deliveryState == "failed"
                        ? "The agent request was rejected. Your message is saved. No automatic retry was made."
                        : "The agent request could not be confirmed. Your message is saved; no automatic retry was made."
                } else if ["queued", "running", "accepted"].contains(response.deliveryState ?? "") {
                    awaitingAgent = true
                } else if response.deliveryState == "sent" { awaitingAgent = false; lastSendAccepted = false }
                if response.submissionUncertain == true { self.error = "Your saved response awaits verification; automatic retry is disabled." }
                if let required = response.decisionRecoveryRequired { self.error = required; awaitingAgent = false }
                if needsHumanAnswer { awaitingAgent = false }
                if let surface = response.surface {
                    if visual?.surface.surfaceID != surface.surfaceID {
                        visual = try VisualSnapshotRepository(context: context).load(surfaceID: surface.surfaceID)
                            ?? VisualState(surface: surface)
                    }
                } else { visual = nil }
            } catch SourceAPIError.rejected(404) { /* Existing deployments may not expose managed visuals. */ }
            catch { awaitingAgent = false; self.error = "The interactive response could not be verified. Refresh to check it." }
        } catch {
            hostedArtifacts = []
            subagents = []
            if let previous = exportedArtifact?.url { try? FileManager.default.removeItem(at: previous) }
            exportedArtifact = nil
            self.error = "The original conversation could not be read. Your saved outgoing intent has not been replayed."
        }
    }

    private func reconcileHostedUpload(_ item: SourceMessageIntent) async {
        guard !busy, item.ownerScope == ownerScope,
              item.channelID == "hosted_upload:" + conversation.id,
              item.botID == selectedBotID else { return }
        do {
            uploadReconciliations[item.externalID] = try await client.sourceHostedUploadStatus(
                channelID: conversation.id, botID: item.botID, uploadID: item.externalID)
        } catch {
            self.error = "The original hosted file status could not be verified. No duplicate upload was sent."
        }
    }

    private func decideBrowser(_ request: SourceBrowserApproval, decision: String) async {
        guard !browserDecisionBusy, !busy, !request.submitted,
              browserApprovals.contains(where: { $0.id == request.id }),
              request.kind != "authentication" || decision == "cancel",
              decision != "approve" || request.canApprove else { return }
        browserDecisionBusy = true
        defer { browserDecisionBusy = false }
        do {
            try await client.decideSourceBrowserApproval(channelID: conversation.id,
                botID: selectedBotID, requestID: request.id, decision: decision)
            browserApprovals = try await client.sourceBrowserApprovals(
                channelID: conversation.id, botID: selectedBotID)
            self.error = nil
        } catch {
            self.error = "Browser decision not confirmed. Refresh this Bot before attempting another response."
        }
    }

    private func stopCurrentHostedRun() async {
        guard !busy, let activity = hostedActivity,
              activity.canCancel, !activity.cancelRequested,
              let root = activity.rootTurnId, !selectedBotID.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let accepted = try await client.requestSourceHostedCancellation(
                channelID: conversation.id, botID: selectedBotID, rootTurnID: root)
            guard accepted.rootTurnId == root else { throw SourceAPIError.invalidResponse }
            cancelNotice = "Stop requested. This does not guarantee the hosted turn is finished."
            hostedActivity = try await client.sourceHostedActivity(
                channelID: conversation.id, botID: selectedBotID)
        } catch {
            cancelNotice = "Stop outcome could not be confirmed. Refresh status; do not submit another stop request."
        }
    }

    private func prepareHostedInputFile(_ file: URL) async {
        guard !preparingInputFile, unconfirmedUploads.isEmpty, !selectedBotID.isEmpty else { return }
        preparingInputFile = true
        defer { preparingInputFile = false }
        let access = file.startAccessingSecurityScopedResource()
        defer { if access { file.stopAccessingSecurityScopedResource() } }
        do {
            let metadata = try file.resourceValues(forKeys: [.fileSizeKey])
            guard let size = metadata.fileSize, (1...1_048_576).contains(size) else {
                inputUploadNotice = "The maximum supported input file is 1 MB."
                return
            }
            let rawName = file.lastPathComponent
            let safeName = String(rawName.replacingOccurrences(
                of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression).prefix(61))
            guard !safeName.isEmpty, !safeName.contains("..") else {
                inputUploadNotice = "Choose a file with a supported name."
                return
            }
            let contents = try Data(contentsOf: file, options: .mappedIfSafe)
            guard contents.count == size else { throw SourceAPIError.invalidResponse }
            let id = UUID().uuidString
            let originalBot = selectedBotID
            let saved = SourceMessageIntent(ownerScope: ownerScope,
                channelID: "hosted_upload:" + conversation.id, botID: originalBot,
                externalID: id, message: rawName)
            context.insert(saved)
            try context.save() // Persist identity BEFORE any provider request.
            let accepted = try await client.uploadSourceHostedFile(
                channelID: conversation.id, botID: originalBot,
                uploadID: saved.externalID, filename: safeName, contents: contents)
            context.delete(saved)
            try context.save()
            guard selectedBotID == originalBot else { return }
            draft += (draft.isEmpty ? "" : "\n") +
                "Please analyze the uploaded file at " + accepted.path + "."
            inputUploadNotice = "File uploaded to your Bot's sandbox. Send the drafted instruction when ready."
        } catch {
            inputUploadNotice = "File upload outcome could not be confirmed. Review the saved upload before selecting another file."
        }
    }

    private func download(_ artifact: SourceHostedArtifact) async {
        guard downloadingArtifactID == nil,
              hostedArtifacts.contains(where: { $0.id == artifact.id }),
              !selectedBotID.isEmpty else { return }
        downloadingArtifactID = artifact.id
        defer { downloadingArtifactID = nil }
        do {
            let file = try await client.downloadSourceHostedArtifact(
                channelID: conversation.id, botID: selectedBotID, artifact: artifact)
            guard hostedArtifacts.contains(where: { $0.id == artifact.id }) else {
                try? FileManager.default.removeItem(at: file)
                return
            }
            exportedArtifact = (id: artifact.id, url: file)
            error = nil
        } catch {
            self.error = "The generated file is unavailable or its source authorization could not be confirmed."
        }
    }

    private func send() async {
        guard !busy, pending.isEmpty, !selectedBotID.isEmpty else { return }
        let text = draft
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = SourceMessageIntent(ownerScope: ownerScope, channelID: conversation.id,
                botID: selectedBotID, externalID: UUID().uuidString, message: text)
            context.insert(saved)
            try context.save() // Durable BEFORE first source queue submission.
            try await client.sendSourceMessage(channelID: saved.channelID, botID: saved.botID,
                text: saved.message, externalID: saved.externalID)
            context.delete(saved)
            try context.save()
            draft = ""
            lastSendAccepted = true
            awaitingAgent = true
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: selectedBotID)
            self.error = nil
        } catch {
            self.error = "Delivery is not confirmed. Check the saved submission before composing another message."
        }
    }

    private func resend(_ item: SourceMessageIntent) async {
        guard !busy, item.ownerScope == ownerScope, item.channelID == conversation.id,
              conversation.agentIds.contains(item.botID) else { return }
        busy = true
        defer { busy = false }
        do {
            // The original source DeliveryStore deduplicates by externalId.
            // Never fabricate a new ID while reconciling uncertain delivery.
            try await client.sendSourceMessage(channelID: item.channelID, botID: item.botID,
                text: item.message, externalID: item.externalID)
            context.delete(item)
            try context.save()
            lastSendAccepted = true
            awaitingAgent = true
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: item.botID)
            self.error = nil
        } catch {
            self.error = "The original source delivery outcome is still uncertain. No new request was created."
        }
    }
}


/// A finished decision is a receipt, not another disabled set of buttons.
/// Read-only result/gallery nodes continue to use the original native renderer.
private struct SourceCompletedVisualReceipt: View {
    let saved: SourceCompletedVisual
    let state: VisualState

    var body: some View {
        ForEach(saved.surface.nodes) { node in
            switch node.kind {
            case .askChoice:
                VStack(alignment: .leading, spacing: 6) {
                    Text(node.title).font(.subheadline.weight(.semibold))
                    if let selectedLabel = saved.selectedLabel {
                        Label("Selected: " + selectedLabel, systemImage: "checkmark.circle.fill")
                    } else {
                        Label("Choice closed", systemImage: "clock")
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .askForm, .askApproval, .sourceComposition:
                VStack(alignment: .leading, spacing: 6) {
                    Text(node.title).font(.subheadline.weight(.semibold))
                    Label("Interaction closed", systemImage: "checkmark.circle")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            default:
                VisualNodesView(state: state, onAction: { _, _, _ in })
                    .section(for: node)
                    .disabled(true)
            }
        }
    }
}

/// Native drawing translated from OpenDuet mic-orb-draw.ts: Ocean palette,
/// four drifting masses, spherical eye projection and five-slot microphone pads.
/// Spring tracks/finish rays remain a fidelity follow-up; no fake execution state.
private struct SourceDuetPresence: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    let working: Bool
    let drafting: Bool
    let blocked: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1/30, paused: reduceMotion || scenePhase != .active || blocked)) { timeline in
            Canvas { context, size in
                let t = reduceMotion || blocked ? 0 : timeline.date.timeIntervalSinceReferenceDate
                let r = min(size.width, size.height) * 0.36
                let center = CGPoint(x: size.width/2, y: size.height/2)
                let ocean = [Self.color(0.74,0.13,205), Self.color(0.86,0.08,220), Self.color(0.75,0.13,232), Self.color(0.53,0.2,262)]
                context.translateBy(x: center.x, y: center.y)
                let open = working ? 0.95 : drafting ? 0.82 : 0.2
                for side in [-1.0, 1.0] {
                    let x = side*r*(1.04+0.08*open)
                    let pad = CGRect(x: x-r*0.25, y: -r*0.46, width: r*0.5, height: r)
                    context.fill(Path(roundedRect: pad, cornerRadius: r*0.22), with: .linearGradient(Gradient(colors: [ocean[3], ocean[3].opacity(0.75)]), startPoint: CGPoint(x:x,y:-r/2), endPoint: CGPoint(x:x,y:r/2)))
                    for slot in 0..<5 {
                        let y = r*0.32-r*0.64*Double(slot)/4
                        var line = Path(); line.move(to: CGPoint(x:x+side*r*0.01,y:y)); line.addLine(to: CGPoint(x:x+side*r*0.15,y:y))
                        let scan = (0.5+0.5*sin(2.4*t))*4
                        let lit = working ? exp(-pow(Double(slot)-scan,2)/0.5) : drafting ? 0.65 : 0
                        context.stroke(line, with: .color(lit > 0.3 ? .white.opacity(lit) : .black.opacity(0.45)), style: StrokeStyle(lineWidth: max(0.8,r*0.065),lineCap:.round))
                    }
                }
                let circle = Path(ellipseIn: CGRect(x:-r,y:-r,width:r*2,height:r*2))
                var sphere = context; sphere.clip(to:circle)
                sphere.fill(circle, with:.color(Self.color(0.93,0.025,235)))
                let angles=[3.95,5.5,0.78,2.36], distances=[0.43,0.45,0.45,0.45], radii=[0.88,0.74,0.86,0.88]
                for index in 0..<4 {
                    let a=angles[index]+0.22*t+0.42*sin(0.29*t+Double(index)*1.93)
                    let p=CGPoint(x:cos(a)*distances[index]*r,y:sin(a)*distances[index]*r)
                    sphere.fill(circle,with:.radialGradient(Gradient(colors:[ocean[index].opacity(0.94),ocean[index].opacity(0)]),center:p,startRadius:0,endRadius:r*radii[index]))
                }
                sphere.fill(circle,with:.radialGradient(Gradient(stops:[.init(color:.clear,location:0.55),.init(color:Color(red:14/255,green:30/255,blue:80/255).opacity(0.24),location:1)]),center:CGPoint(x:0,y:-r*0.12),startRadius:0,endRadius:r*1.16))
                sphere.stroke(circle,with:.linearGradient(Gradient(colors:[.white.opacity(0.7),.clear]),startPoint:CGPoint(x:0,y:-r),endPoint:CGPoint(x:0,y:r*0.25)),lineWidth:max(1,r*0.05))
                let yaw = (working ? -0.36 : drafting ? 0.1 : 0)*0.62
                let pitch = -(working ? -0.5 : drafting ? 0.6 : 0.04)*0.5
                for side in [-1.0,1.0] {
                    let lon=side*0.35, lat=0.05
                    let x=sin(lon)*cos(lat), y=sin(lat), z=cos(lon)*cos(lat)
                    let sy=y*cos(pitch)+z*sin(pitch), z1 = -y*sin(pitch)+z*cos(pitch)
                    let sx=x*cos(yaw)+z1*sin(yaw)
                    let width=max(2.4,r*0.16)*sqrt(max(0.12,1-sx*sx))
                    let blink = !reduceMotion && !blocked && t.truncatingRemainder(dividingBy:4.2)<0.12
                    let height=max(1.1,r*0.3*(working ? 0.7 : 1)*(blink ? 0.06 : 1))
                    let rect=CGRect(x:sx*r*0.84-width/2,y:-sy*r*0.84-height/2,width:width,height:height)
                    sphere.fill(Path(roundedRect:rect,cornerRadius:width/2),with:.color(.white.opacity(0.97)))
                }
            }
        }
        .accessibilityLabel(blocked ? "Agent stopped" : working ? "Agent thinking" : drafting ? "Agent listening" : "Agent ready")
    }

    private static func color(_ l: Double, _ c: Double, _ hue: Double) -> Color {
        let a=c*cos(hue * .pi/180), b=c*sin(hue * .pi/180)
        let ll=pow(l+0.3963377774*a+0.2158037573*b,3)
        let mm=pow(l-0.1055613458*a-0.0638541728*b,3)
        let ss=pow(l-0.0894841775*a-1.291485548*b,3)
        func gamma(_ v:Double)->Double { let v=max(0,min(1,v));return v<=0.0031308 ? v*12.92 : 1.055*pow(v,1/2.4)-0.055 }
        return Color(red:gamma(4.0767416621*ll-3.3077115913*mm+0.2309699292*ss),green:gamma(-1.2684380046*ll+2.6097574011*mm-0.3413193965*ss),blue:gamma(-0.0041960863*ll-0.7034186147*mm+1.707614701*ss))
    }
}
