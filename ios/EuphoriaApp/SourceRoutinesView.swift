import SwiftUI

/// Original OpenDuet routine metadata and history. The source scheduler
/// remains authoritative until managed Agents Automations is verified and
/// atomically substituted. This screen does not create a second scheduler.
struct SourceRoutinesView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var routines: [SourceRoutine] = []
    @State private var sweep: SourceRoutineSweep?
    @State private var runs: [String: [SourceRoutineRun]] = [:]
    @State private var pauseID: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("These are your original OpenDuet routines. Managed OpenAI Automations dispatch is not enabled until scheduling, ownership and run-history parity is verified.")
                    .font(.caption).foregroundStyle(.secondary)
                if let sweep {
                    LabeledContent("Original worker", value: sweep.working ? "Responding" : "Not confirmed")
                    if let last = sweep.lastSweptAt {
                        Text("Last source sweep: " + last).font(.caption).foregroundStyle(.secondary)
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
                        LabeledContent("Status", value: routine.enabled ? "Enabled" : "Paused")
                        LabeledContent("Next scheduled", value: routine.nextRunAt)
                        if let last = routine.lastRun?.status {
                            LabeledContent("Last run", value: last)
                        }
                        if routine.enabled {
                            Button("Pause routine", role: .destructive) { pauseID = routine.id }
                                .disabled(busy)
                        }
                        Button("View real run history") { Task { await loadRuns(routine.id) } }
                            .disabled(busy)
                    }
                    if let entries = runs[routine.id] {
                        ForEach(entries) { entry in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.status.capitalized)
                                Text(entry.startedAt).font(.caption).foregroundStyle(.secondary)
                                if let reason = entry.error { Text(reason).font(.caption).foregroundStyle(.orange) }
                            }
                        }
                        if entries.isEmpty { Text("No recorded runs.").foregroundStyle(.secondary) }
                    }
                } header: {
                    Text(routine.channel.name ?? "Routine")
                }
            }
            if routines.isEmpty && !busy && error == nil {
                ContentUnavailableView("No routines", systemImage: "calendar.badge.clock")
            }
            if busy { ProgressView("Reading original routines…") }
        }
        .navigationTitle("Routines")
        .refreshable { await refresh() }
        .task { await refresh() }
        .confirmationDialog("Pause this OpenDuet routine?", isPresented: Binding(
            get: { pauseID != nil },
            set: { if !$0 { pauseID = nil } }
        ), titleVisibility: .visible) {
            Button("Pause", role: .destructive) {
                if let id = pauseID { Task { await pause(id) } }
                pauseID = nil
            }
            Button("Cancel", role: .cancel) { pauseID = nil }
        } message: {
            Text("The original source service controls the schedule; an in-flight run may still finish.")
        }
    }

    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            let result = try await source.sourceRoutines()
            routines = result.routines
            sweep = result.sweep
            client = source
            self.error = nil
        } catch {
            client = nil
            self.error = "Routines are unavailable. Sign in through Bots and check your OpenDuet deployment."
        }
    }

    private func loadRuns(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            runs[id] = try await client.sourceRoutineRuns(id: id)
            self.error = nil
        } catch { self.error = "Routine history could not be loaded." }
    }
    private func pause(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.pauseSourceRoutine(id: id)
            let result = try await client.sourceRoutines()
            routines = result.routines
            sweep = result.sweep
            self.error = nil
        } catch {
            self.error = "Pause outcome is uncertain. Refresh the source routine before attempting another change."
        }
    }
}
