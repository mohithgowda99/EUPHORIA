import SwiftUI

/// Faithful native controls over the ORIGINAL OpenDuet editable memory store.
/// Sessions/compaction in Agents API are not user-editable memory or provenance.
struct SourceMemoryView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var memories: [SourceMemory] = []
    @State private var newMemory = ""
    @State private var editingID: String?
    @State private var editingContent = ""
    @State private var pendingDeleteID: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("These are the memories in your original OpenDuet account. You can review, edit, disable or delete them.")
                    .font(.caption).foregroundStyle(.secondary)
                if client == nil {
                    Text("Sign in from Bots to connect your memory.")
                        .foregroundStyle(.secondary)
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Try again") { Task { await reload() } }.disabled(busy)
                }
            }
            if client != nil {
                Section("Remember something") {
                    TextField("Something your Bots should remember", text: $newMemory, axis: .vertical)
                        .lineLimit(2...6)
                    Button("Remember this") { Task { await create() } }
                        .disabled(busy || newMemory.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                  newMemory.count > 6000)
                }
                ForEach(memories) { memory in
                    Section {
                        if editingID == memory.id {
                            TextField("Edit memory", text: $editingContent, axis: .vertical)
                                .lineLimit(3...8)
                            HStack {
                                Button("Save") { Task { await edit(memory.id) } }
                                    .disabled(busy || editingContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                Button("Cancel") { editingID = nil }
                            }
                        } else {
                            Text(memory.content)
                                .foregroundStyle(memory.enabled ? .primary : .secondary)
                                .textSelection(.enabled)
                        }
                        Text(memory.provenance + " · " + memory.formedBy.replacingOccurrences(of: "_", with: " "))
                            .font(.caption).foregroundStyle(.secondary)
                        if memory.reviewState == "unreviewed" {
                            Button("Confirm memory") { Task { await confirm(memory.id) } }
                                .disabled(busy)
                        }
                        Toggle("Use this memory", isOn: Binding(
                            get: { memories.first(where: { $0.id == memory.id })?.enabled ?? false },
                            set: { enabled in Task { await changeEnabled(memory.id, enabled: enabled) } }
                        ))
                        .disabled(busy)
                        HStack {
                            Button("Edit") {
                                editingID = memory.id; editingContent = memory.content
                            }.disabled(busy)
                            Spacer()
                            Button("Delete", role: .destructive) { pendingDeleteID = memory.id }
                                .disabled(busy)
                        }
                    }
                }
                if memories.isEmpty && !busy && error == nil {
                    ContentUnavailableView("Nothing remembered yet", systemImage: "brain.head.profile")
                }
            }
            if busy { ProgressView("Updating OpenDuet memories…") }
        }
        .navigationTitle("Memory")
        .refreshable { await reload() }
        .task { await reload() }
        .confirmationDialog("Delete this memory from OpenDuet?", isPresented: Binding(
            get: { pendingDeleteID != nil },
            set: { if !$0 { pendingDeleteID = nil } }
        ), titleVisibility: .visible) {
            Button("Delete memory", role: .destructive) {
                if let id = pendingDeleteID { Task { await delete(id) } }
                pendingDeleteID = nil
            }
            Button("Cancel", role: .cancel) { pendingDeleteID = nil }
        } message: {
            Text("The original OpenDuet service controls deletion and any connected Intelligence mirror.")
        }
    }

    private func reload() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let service = try SavedOpenDuetAccount.client()
            _ = try await service.sourceSession()
            memories = try await service.memories()
            client = service
            error = nil
        } catch {
            client = nil
            error = "Memory could not be loaded. Sign in under Bots, then try again."
        }
    }
    private func perform(_ change: (OpenDuetSourceAPI) async throws -> Void) async {
        guard let client, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await change(client)
            memories = try await client.memories()
            error = nil
        } catch {
            // Source state, not the button press, is authoritative.
            // A write with a lost response is not repeated automatically.
            error = "The change could not be confirmed. Refresh the source memory list before trying again."
        }
    }
    private func create() async {
        let saved = newMemory
        await perform { api in _ = try await api.remember(saved) }
        if error == nil { newMemory = "" }
    }
    private func edit(_ id: String) async {
        let saved = editingContent
        await perform { api in _ = try await api.editMemory(id: id, content: saved) }
        if error == nil { editingID = nil }
    }
    private func confirm(_ id: String) async {
        await perform { api in _ = try await api.confirmMemory(id: id) }
    }
    private func changeEnabled(_ id: String, enabled: Bool) async {
        await perform { api in _ = try await api.setMemoryEnabled(id: id, enabled: enabled) }
    }
    private func delete(_ id: String) async {
        await perform { api in try await api.deleteMemory(id: id) }
    }
}
