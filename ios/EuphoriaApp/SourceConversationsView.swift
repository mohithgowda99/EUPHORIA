import SwiftUI
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
                                Text(conversation.agentIds.count == 1 ? "One Bot" : "\\(conversation.agentIds.count) Bots")
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
            error = nil
        } catch {
            client = nil
            error = "Source Chat is unavailable. Sign in through Bots or check your OpenDuet deployment."
        }
    }
    private func loadMore(cursor: String) async {
        guard !loading, let client else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await client.sourceConversations(cursor: cursor)
            let found = Set(conversations.map(\\.id))
            conversations += page.conversations.filter { !found.contains($0.id) }
            self.cursor = page.nextCursor
            error = nil
        } catch { error = "Older conversations could not be loaded." }
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
            error = nil
        } catch {
            // A lost response can have created a channel. Never blindly create
            // another; refresh the original source roster to reconcile.
            error = "Channel creation could not be confirmed. Refresh the roster before creating another."
        }
    }
}

/// The source DeliveryStore already deduplicates native messages by externalID.
/// Only the outbound submission identity is archived on-device before sending.
struct SourceConversationDetailView: View {
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

    private var pending: [SourceMessageIntent] {
        allPending.filter { $0.ownerScope == ownerScope && $0.channelID == conversation.id }
    }

    var body: some View {
        List {
            if conversation.agentIds.count > 1 {
                Section("Bot") {
                    Picker("Talk to", selection: $selectedBotID) {
                        ForEach(conversation.agentIds, id: \.self) { id in
                            Text(id).tag(id)
                        }
                    }
                }
            }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh conversation") { Task { await reload() } }
                }
            }
            Section("Messages") {
                ForEach(messages) { message in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(message.role == "user" ? "You" : "Bot")
                            .font(.caption).foregroundStyle(.secondary)
                        if !message.text.isEmpty { Text(message.text).textSelection(.enabled) }
                        if message.unsupportedContent {
                            Text("Some rich source content cannot be previewed here yet.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if lastSendAccepted {
                    Text("Message accepted by OpenDuet's delivery queue. The Bot may still be working.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if messages.isEmpty && !busy {
                    Text("No saved messages yet.").foregroundStyle(.secondary)
                }
            }
            if !pending.isEmpty {
                Section("Unconfirmed delivery") {
                    ForEach(pending) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.message)
                            Text("The outcome is uncertain. The exact external delivery ID is saved; a recovery attempt cannot create a new request identity.")
                                .font(.caption).foregroundStyle(.secondary)
                            Button("Check same saved submission") { Task { await resend(item) } }
                                .disabled(busy)
                        }
                    }
                }
            }
            if allowsSending {
                Section("Message") {
                    TextField("Ask this Bot", text: $draft, axis: .vertical)
                        .lineLimit(2...7)
                    Button("Send") { Task { await send() } }
                        .disabled(busy || !pending.isEmpty || selectedBotID.isEmpty ||
                                  draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            } else {
                Section {
                    Text("Use the Task reply action to continue this work. It preserves the original TaskStore lifecycle and reply semantics.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if busy { ProgressView("Contacting the original OpenDuet service…") }
        }
        .navigationTitle(conversation.name.isEmpty ? "Conversation" : conversation.name)
        .refreshable { await reload() }
        .task {
            if selectedBotID.isEmpty { selectedBotID = conversation.agentIds.first ?? "" }
            await reload()
        }
        .onChange(of: selectedBotID) { _, _ in Task { await reload() } }
    }

    private func reload() async {
        guard !busy, !selectedBotID.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let channel = try await client.sourceConversation(id: conversation.id)
            guard channel.agentIds.contains(selectedBotID) else { throw SourceAPIError.invalidResponse }
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: selectedBotID)
            error = nil
        } catch {
            error = "The original conversation could not be read. Your saved outgoing intent has not been replayed."
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
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: selectedBotID)
            error = nil
        } catch {
            error = "Delivery is not confirmed. Check the saved submission before composing another message."
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
            messages = try await client.sourceHistory(channelID: conversation.id, agentID: item.botID)
            error = nil
        } catch {
            error = "The original source delivery outcome is still uncertain. No new request was created."
        }
    }
}
