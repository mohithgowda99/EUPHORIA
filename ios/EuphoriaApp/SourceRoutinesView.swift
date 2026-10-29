import SwiftUI

/// Source-owned routine schedule and real provider delivery state.
/// No simulated progress or device-local scheduler.
struct SourceRoutinesView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var routines: [SourceRoutine] = []
    @State private var sweep: SourceRoutineSweep?
    @State private var runs: [String: [SourceRoutineRun]] = [:]
    @State private var remote: [String: SourceManagedRoutineState] = [:]
    @State private var busy = false
    @State private var error: String?
    @State private var selectedDelete: String?
    @State private var selectedMigration: String?
    @State private var editID: String?
    @State private var draftInstruction = ""
    @State private var draftCron = ""
    @State private var draftZone = ""

    var body: some View {
        List {
            Section {
                Text("Original OpenDuet owns Bot, routine and channel permissions. Cloud delivery does not prove completed work.")
                    .font(.caption).foregroundStyle(.secondary)
                if let sweep {
                    LabeledContent("Original worker", value: sweep.working ? "Responding" : "Not confirmed")
                    if let last = sweep.lastSweptAt {
                        Text("Source sweep: " + last).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Retry read") { Task { await refresh() } }
                }
            }
            ForEach(routines) { routine in
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(routine.instruction).font(.headline)
                        LabeledContent("Schedule", value: routine.schedule)
                        LabeledContent("Time zone", value: routine.timezone)
                        LabeledContent("Bot", value: routine.agentId)
                        LabeledContent("Execution", value: backendLabel(routine))
                        LabeledContent("Status", value: routine.enabled ? "Enabled" : "Paused")
                        LabeledContent("Next intended run", value: routine.nextRunAt)
                        if let outcome = routine.lastRun?.status {
                            LabeledContent("Last run", value: outcome)
                        }
                        if routine.executionBackend == "managed" {
                            Text("The provider schedules delivery. Completion is confirmed only after source reconciliation.")
                                .font(.caption).foregroundStyle(.secondary)
                            Button("Inspect provider invocations") {
                                Task { await inspect(routine.id) }
                            }
                            if let receiptState = remote[routine.id] {
                                ForEach(receiptState.invocations) { receipt in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(receipt.executionStatus.capitalized)
                                            .font(.subheadline).bold()
                                        Text("Delivery: " + receipt.deliveryStatus)
                                        Text(receipt.createdAt)
                                            .font(.caption).foregroundStyle(.secondary)
                                        if receipt.rootTurnId == nil {
                                            Text("Root turn not verified")
                                                .font(.caption).foregroundStyle(.orange)
                                        }
                                    }
                                    .padding(.vertical, 3)
                                }
                                if receiptState.invocations.isEmpty {
                                    Text("No provider invocation receipts yet.")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        } else if routine.executionBackend == "provisioning" ||
                                    routine.executionBackend == "sync_unknown" {
                            Text("Provider sync is uncertain. Source firing is held for safety. Do not repeat the operation.")
                            Button("Inspect and repair provider mapping") {
                                Task { await repair(routine.id) }
                            }
                            .disabled(busy)
                                .font(.caption).foregroundStyle(.orange)
                        }
                        HStack {
                            if routine.executionBackend == "managed" {
                                Button(routine.enabled ? "Pause" : "Resume") {
                                    Task { await perform(routine, operation: routine.enabled ? "pause" : "resume") }
                                }
                                Button("Edit") { beginEdit(routine) }
                                Button("Run now") { Task { await perform(routine, operation: "run") } }
                            } else if routine.executionBackend == "source" ||
                                      routine.executionBackend == nil {
                                Button(routine.enabled ? "Pause" : "Resume") {
                                    Task { await perform(routine, operation: routine.enabled ? "sourcePause" : "sourceResume") }
                                }
                                Button("Run now") { Task { await perform(routine, operation: "run") } }
                                if routine.enabled {
                                    Button("Switch to OpenAI Automations") { selectedMigration = routine.id }
                                }
                            }
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                        HStack {
                            Button("View run history") { Task { await loadRuns(routine.id) } }
                            if routine.executionBackend == "managed" {
                                Button("Reconcile") { Task { await reconcile(routine.id) } }
                                Button("Delete", role: .destructive) { selectedDelete = routine.id }
                            }
                        }
                        .disabled(busy)
                    }
                    if let entries = runs[routine.id] {
                        ForEach(entries) { entry in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.status.capitalized)
                                Text(entry.startedAt).font(.caption).foregroundStyle(.secondary)
                                if let reason = entry.error {
                                    Text(reason).font(.caption).foregroundStyle(.orange)
                                }
                            }
                        }
                        if entries.isEmpty {
                            Text("No recorded runs.").foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text(routine.channel.name ?? "Routine")
                }
            }
            if routines.isEmpty && !busy && error == nil {
                ContentUnavailableView("No routines", systemImage: "calendar.badge.clock",
                    description: Text("Create a routine through your Bot conversation."))
            }
            if busy { ProgressView("Checking the original source…") }
        }
        .navigationTitle("Routines")
        .refreshable { await refresh() }
        .task { await refresh() }
        .confirmationDialog("Move this routine to OpenAI Automations?", isPresented: Binding(
            get: { selectedMigration != nil },
            set: { if !$0 { selectedMigration = nil } }
        ), titleVisibility: .visible) {
            Button("Switch scheduling provider") {
                if let id = selectedMigration,
                   let routine = routines.first(where: { $0.id == id }) {
                    Task { await perform(routine, operation: "migrate") }
                }
                selectedMigration = nil
            }
            Button("Cancel", role: .cancel) { selectedMigration = nil }
        } message: {
            Text("This requires an enforceable cloud spending cap. The original routine stops firing before migration; uncertain transitions require repair.")
        }
        .confirmationDialog("Delete this managed routine?", isPresented: Binding(
            get: { selectedDelete != nil },
            set: { if !$0 { selectedDelete = nil } }
        ), titleVisibility: .visible) {
            Button("Delete schedule", role: .destructive) {
                if let id = selectedDelete,
                   let routine = routines.first(where: { $0.id == id }) {
                    Task { await perform(routine, operation: "delete") }
                }
                selectedDelete = nil
            }
            Button("Cancel", role: .cancel) { selectedDelete = nil }
        } message: {
            Text("Future cloud invocations stop after confirmation. In-flight work may continue.")
        }
        .sheet(isPresented: Binding(
            get: { editID != nil },
            set: { if !$0 { editID = nil } }
        )) {
            NavigationStack {
                Form {
                    Section("Instruction") { TextEditor(text: $draftInstruction).frame(minHeight: 120) }
                    Section("Five-field cron") { TextField("0 8 * * MON-FRI", text: $draftCron) }
                    Section("IANA time zone") { TextField("Asia/Kolkata", text: $draftZone) }
                    Text("Changes only apply after the provider confirms acceptance.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .navigationTitle("Edit routine")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { editID = nil }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            if let id = editID { Task { await saveEdit(id) } }
                        }
                        .disabled(busy || draftInstruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
    }

    private func backendLabel(_ routine: SourceRoutine) -> String {
        switch routine.executionBackend {
        case "managed": return "OpenAI managed"
        case "provisioning", "sync_unknown": return "Reconciliation required"
        default: return "Original source"
        }
    }
    private func beginEdit(_ routine: SourceRoutine) {
        draftInstruction = routine.instruction
        draftCron = routine.cron ?? ""
        draftZone = routine.timezone
        editID = routine.id
    }
    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            let page = try await source.sourceRoutines()
            routines = page.routines
            sweep = page.sweep
            client = source
            error = nil
        } catch {
            client = nil
            self.error = "Routines are unavailable. Sign in through Bots and check the source deployment."
        }
    }
    private func loadRuns(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            runs[id] = try await client.sourceRoutineRuns(id: id)
            error = nil
        } catch { error = "The original run history could not be loaded." }
    }
    private func inspect(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            remote[id] = try await client.managedRoutineState(id: id)
            error = nil
        } catch { error = "Provider receipt history is unavailable." }
    }
    private func repair(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            let outcome = try await client.repairManagedRoutine(id: id)
            let page = try await client.sourceRoutines()
            routines = page.routines
            sweep = page.sweep
            error = outcome.reconciled ? nil : (outcome.reason ?? "Provider state is still uncertain.")
        } catch {
            error = "Provider repair could not be verified. Source scheduling remains held."
        }
    }
    private func reconcile(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await client.reconcileManagedRoutine(id: id)
            remote[id] = try await client.managedRoutineState(id: id)
            runs[id] = try await client.sourceRoutineRuns(id: id)
            error = nil
        } catch { error = "Reconciliation is incomplete. Do not retry uncertain provider writes." }
    }
    private func perform(_ routine: SourceRoutine, operation: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "_")
        do {
            switch operation {
            case "sourcePause": try await client.setSourceRoutineEnabled(id: routine.id, enabled: false)
            case "sourceResume": try await client.setSourceRoutineEnabled(id: routine.id, enabled: true)
            case "run":
                let result = try await client.runSourceRoutine(id: routine.id, requestId: nonce)
                if result.uncertain == true {
                    error = "Invocation was previously requested. Inspect history before another run."
                } else {
                    error = "Run request accepted. Execution is not yet verified."
                }
            default:
                _ = try await client.changeManagedRoutine(id: routine.id, operation: operation,
                    requestId: nonce)
                error = nil
            }
            let page = try await client.sourceRoutines()
            routines = page.routines
            sweep = page.sweep
        } catch {
            self.error = "Operation is blocked or its outcome is uncertain. Refresh source and provider state before retrying."
        }
    }
    private func saveEdit(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "_")
        do {
            _ = try await client.editManagedRoutine(id: id, requestId: nonce,
                patch: SourceManagedRoutineEditPatch(instruction: draftInstruction,
                    cron: draftCron, timezone: draftZone))
            editID = nil
            let page = try await client.sourceRoutines()
            routines = page.routines
            sweep = page.sweep
            error = nil
        } catch {
            error = "Edit is blocked or uncertain. Reconcile the source routine before editing again."
        }
    }
}
