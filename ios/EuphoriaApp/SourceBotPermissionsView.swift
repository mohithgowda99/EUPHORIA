import SwiftUI

/// The original PluginStore determines every skill and connected tool
/// available to each Bot. Managed Agents plugins/MCP must be given only this
/// server-approved grant set, not all connections present in the account.
struct SourceBotPermissionsView: View {
    let client: OpenDuetSourceAPI
    let botID: String
    @State private var catalogue: [SourceSkill] = []
    @State private var grants: SourceBotGrants?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Original OpenDuet authorization. A skill is an instruction; it does not bypass the tool permissions and approval rules assigned to this Bot.")
                    .font(.caption).foregroundStyle(.secondary)
                if let error {
                    Text(error).foregroundStyle(.red)
                    Button("Refresh grants") { Task { await reload() } }
                }
            }
            Section("Skills") {
                ForEach(catalogue) { skill in
                    Toggle(isOn: Binding(
                        get: { grants?.skills.contains(where: { $0.slug == skill.slug }) ?? false },
                        set: { checked in Task { await setSkill(skill.slug, checked) } }
                    )) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(skill.title)
                            Text(skill.summary).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(busy || grants == nil)
                }
                if catalogue.isEmpty && !busy && error == nil {
                    Text("No skills available to this account.").foregroundStyle(.secondary)
                }
            }
            Section("Connected tools this Bot may use") {
                ForEach(grants?.tools ?? [], id: \.ref) { tool in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(tool.ref).font(.headline)
                        Text(tool.description).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if grants?.tools.isEmpty ?? true {
                    Text("No connected tools are granted to this Bot.")
                        .foregroundStyle(.secondary)
                }
                Text("Connecting or revoking an external account uses the original OpenDuet connection service. This view cannot grant account-wide MCP access by itself.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if busy { ProgressView("Reading original Bot permissions…") }
        }
        .navigationTitle("Skills & Tools")
        .refreshable { await reload() }
        .task(id: botID) { await reload() }
    }

    private func reload() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let results = try await client.sourceSkills()
            let owned = try await client.sourceBotGrants(botID: botID)
            catalogue = results
            grants = owned
            error = nil
        } catch {
            error = "Bot tools and skills cannot be verified. The previous grant state will not be assumed current."
            grants = nil
        }
    }
    private func setSkill(_ slug: String, _ enabled: Bool) async {
        guard !busy, grants != nil else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.setSourceSkillGrant(botID: botID, slug: slug, enabled: enabled)
            grants = try await client.sourceBotGrants(botID: botID)
            error = nil
        } catch {
            grants = nil
            error = "The original permission change is uncertain. Refresh the source grants before trying again."
        }
    }
}
