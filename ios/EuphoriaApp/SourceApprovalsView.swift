import SwiftUI

/// Native original ApprovalService inbox. Decisions remain source policy-owned.
/// Unsafe "Allow" is held until the full target/arguments preview can be
/// rendered and verified. Denials and direct questions use the source routes.
struct SourceApprovalsView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var inbox: SourceApprovalInbox?
    @State private var responses: [String: String] = [:]
    @State private var confirmDenyID: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("OpenDuet decides which tools require your permission. An agent-generated screen cannot override its approval policies.")
                    .font(.caption).foregroundStyle(.secondary)
                if client == nil {
                    Text("Sign in through Bots to review your original account's approvals.")
                        .foregroundStyle(.secondary)
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh source inbox") { Task { await refresh() } }.disabled(busy)
                }
            }
            if let inbox {
                Section("Waiting for your approval") {
                    let pending = inbox.requests.filter { $0.status == "pending" }
                    ForEach(pending) { approval in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(approval.toolRef ?? approval.action?.toolRef ?? "Unidentified tool")
                                .font(.headline)
                            Text("Bot: " + (approval.botId ?? approval.action?.botId ?? "Unidentified"))
                                .font(.caption).foregroundStyle(.secondary)
                            Text("Effect: " + (approval.effect ?? approval.action?.effect ?? "Unspecified"))
                            Text("Scope: " + (approval.scope ?? approval.action?.scope ?? "Unspecified"))
                                .font(.caption).foregroundStyle(.secondary)
                            Button("Deny request", role: .destructive) { confirmDenyID = approval.id }
                                .disabled(busy)
                            Text("Allow is unavailable until the original action target and complete parameters can be safely previewed. This prevents blind authorization.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if pending.isEmpty {
                        Text("Nothing waiting for approval.").foregroundStyle(.secondary)
                    }
                }
                Section("Questions from Bots") {
                    ForEach(inbox.questions ?? []) { question in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(question.question).font(.headline)
                            if let why = question.why { Text(why).font(.caption).foregroundStyle(.secondary) }
                            TextField("Your response", text: Binding(
                                get: { responses[question.id, default: ""] },
                                set: { responses[question.id] = $0 }
                            ), axis: .vertical)
                                .lineLimit(2...6)
                            Button("Send answer") {
                                Task { await answer(question.id) }
                            }
                            .disabled(busy || responses[question.id, default: ""].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    if inbox.questions?.isEmpty ?? true {
                        Text("No questions waiting.").foregroundStyle(.secondary)
                    }
                }
            }
            if busy { ProgressView("Reading source approvals…") }
        }
        .navigationTitle("Approvals")
        .refreshable { await refresh() }
        .task { await refresh() }
        .confirmationDialog("Deny this original OpenDuet request?", isPresented: Binding(
            get: { confirmDenyID != nil },
            set: { if !$0 { confirmDenyID = nil } }
        ), titleVisibility: .visible) {
            Button("Deny", role: .destructive) {
                if let id = confirmDenyID { Task { await deny(id) } }
                confirmDenyID = nil
            }
            Button("Cancel", role: .cancel) { confirmDenyID = nil }
        } message: {
            Text("The source service will record the refusal and enforce its continuation rules.")
        }
    }

    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            inbox = try await source.approvalInbox()
            client = source
            self.error = nil
        } catch {
            client = nil
            self.error = "The approval inbox is unavailable. Sign in under Bots, then retry."
        }
    }

    private func deny(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            let decision = try await client.refuseApproval(id: id)
            guard decision.id == id else { throw SourceAPIError.invalidResponse }
            inbox = try await client.approvalInbox()
            self.error = nil
        } catch {
            self.error = "The decision could not be confirmed. Refresh the original inbox before acting again."
        }
    }

    private func answer(_ id: String) async {
        guard !busy, let client else { return }
        let text = responses[id, default: ""]
        busy = true
        defer { busy = false }
        do {
            try await client.answerQuestion(id: id, response: text)
            inbox = try await client.approvalInbox()
            responses[id] = ""
            self.error = nil
        } catch {
            self.error = "The answer might have reached the Bot. Refresh the original inbox before sending anything again."
        }
    }
}
