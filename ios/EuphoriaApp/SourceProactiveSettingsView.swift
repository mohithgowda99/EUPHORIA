import SwiftUI

/// Native configuration of the ORIGINAL ProactiveStore, not a second
/// autonomous scheduler. The managed-agent runtime must not enable recurring
/// research until exact execution identity and spending limits are verified.
struct SourceProactiveSettingsView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var settings: [SourceProactiveSetting] = []
    @State private var routines: [SourceRoutine] = []
    @State private var selectedRoutineID = ""
    @State private var focus = ""
    @State private var interval = 240
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Label("Autonomous managed research is paused", systemImage: "pause.circle")
                    .font(.headline)
                Text("You can save a Bot's research focus and schedule preference here. Background inference and connector reads will not start until execution attribution and enforceable spending controls are verified.")
                    .font(.caption).foregroundStyle(.secondary)
                if let error {
                    Text(error).foregroundStyle(.orange)
                    Button("Retry") { Task { await refresh() } }.disabled(busy)
                }
            }
            Section("Original research settings") {
                ForEach(settings) { setting in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(setting.focus.isEmpty ? "General research" : setting.focus)
                            .font(.headline)
                        LabeledContent("Bot", value: setting.agentId)
                        LabeledContent("Interval preference", value: "\(setting.intervalMinutes) minutes")
                        LabeledContent("Source preference", value: setting.enabled ? "Enabled in original Store" : "Disabled")
                        if setting.enabled {
                            Text("This existing source preference is enabled. Managed cloud research is not activated here; you can disable the original preference.")
                                .font(.caption).foregroundStyle(.orange)
                            Button("Disable original preference") {
                                Task { await disable(setting) }
                            }.disabled(busy)
                        }
                        Button("Delete research preference", role: .destructive) {
                            Task { await delete(setting.id) }
                        }.disabled(busy)
                    }
                }
                if settings.isEmpty {
                    Text("No research preferences saved.")
                        .foregroundStyle(.secondary)
                }
            }
            Section("Prepare a research preference") {
                if routines.isEmpty {
                    Text("Create a source-owned routine or Bot conversation first to select an authorized Bot and channel.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Picker("Bot and channel", selection: $selectedRoutineID) {
                        ForEach(routines) { routine in
                            Text(routine.channel.name ?? routine.agentId)
                                .tag(routine.id)
                        }
                    }
                    TextField("What should the Bot watch for?", text: $focus, axis: .vertical)
                        .lineLimit(2...5)
                    Stepper("Check-in preference: \(interval) minutes", value: $interval,
                            in: 15...1440, step: 15)
                    Button("Save disabled research preference") {
                        Task { await createDraft() }
                    }
                    .disabled(busy || selectedRoutineID.isEmpty || focus.count > 1000)
                }
            }
            if busy { ProgressView("Checking source state…") }
        }
        .navigationTitle("Proactive research")
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            let page = try await source.sourceProactiveSettings()
            let owned = try await source.sourceRoutines()
            settings = page.settings
            routines = owned.routines.filter { !$0.channel.gone }
            if !routines.contains(where: { $0.id == selectedRoutineID }) {
                selectedRoutineID = routines.first?.id ?? ""
            }
            client = source
            error = nil
        } catch {
            error = "Original research preferences are unavailable. Check your signed-in source deployment."
        }
    }

    private func createDraft() async {
        guard !busy, let client,
              let routine = routines.first(where: { $0.id == selectedRoutineID }) else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await client.createProactiveDraft(agentId: routine.agentId,
                channelId: routine.channel.id, focus: focus, interval: interval)
            settings = try await client.sourceProactiveSettings().settings
            error = nil
        } catch {
            error = "Preference not saved. The Bot or channel may be unauthorized, or a setting already exists."
        }
    }

    private func disable(_ setting: SourceProactiveSetting) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await client.editProactiveDraft(id: setting.id,
                focus: setting.focus, interval: setting.intervalMinutes)
            settings = try await client.sourceProactiveSettings().settings
            error = nil
        } catch {
            error = "Could not confirm the original setting was disabled."
        }
    }

    private func delete(_ id: String) async {
        guard !busy, let client else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.deleteProactiveDraft(id: id)
            settings = try await client.sourceProactiveSettings().settings
            error = nil
        } catch {
            error = "Cannot confirm the preference was deleted. Refresh before retrying."
        }
    }
}
