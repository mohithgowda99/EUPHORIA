import SwiftUI

/// The original PluginStore determines every skill and connected tool
/// available to each Bot. Managed Agents plugins/MCP must be given only this
/// server-approved grant set, not all connections present in the account.
struct SourceBotPermissionsView: View {
    let client: OpenDuetSourceAPI
    let botID: String
    @State private var catalogue: [SourceSkill] = []
    @State private var availableTools: [SourcePluginTool] = []
    @State private var grants: SourceBotGrants?
    @State private var hosted: SourceHostedCapabilitiesResponse?
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
            Section("Hosted compute & delegation") {
                Text("Optional OpenAI-hosted compute. The sandbox has no network access, and delegated subagents inherit only this Bot's approved tools. Hosted execution can incur API charges.")
                    .font(.caption).foregroundStyle(.secondary)
                Toggle("Live web research", isOn: Binding(
                    get: { hosted?.capabilities.webSearch ?? false },
                    set: { value in Task { await updateHosted(webSearch: value) } }
                ))
                .disabled(busy || hosted == nil || hosted?.locked == true)
                Toggle("Read-only public browser", isOn: Binding(
                    get: { hosted?.capabilities.browser ?? false },
                    set: { value in Task { await updateHosted(browser: value) } }
                ))
                .disabled(busy || hosted == nil || hosted?.locked == true || (hosted?.capabilities.sandbox == true || hosted?.capabilities.delegation == true || hosted?.browserAvailable != true))
                if hosted?.browserAvailable == false {
                    Text("Public browser is unavailable until the server operator enables vetted documentation origins.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Text("Only operator-approved documentation sites. Each origin requires your approval. No sign-in or external writes.")
                    .font(.caption2).foregroundStyle(.secondary)
                Toggle("Hosted sandbox", isOn: Binding(
                    get: { hosted?.capabilities.sandbox ?? false },
                    set: { value in Task { await updateHosted(sandbox: value) } }
                ))
                .disabled(busy || hosted == nil || hosted?.locked == true || hosted?.capabilities.browser == true)
                Toggle("Subagent delegation", isOn: Binding(
                    get: { hosted?.capabilities.delegation ?? false },
                    set: { value in Task { await updateHosted(delegation: value) } }
                ))
                .disabled(busy || hosted == nil || hosted?.locked == true)
                if hosted?.capabilities.delegation == true {
                    Picker("Max concurrent subagents", selection: Binding(
                        get: { hosted?.capabilities.maxConcurrentSubagents ?? 1 },
                        set: { value in Task { await updateHosted(maxSubagents: value) } }
                    )) {
                        ForEach(1...3, id: \.self) { n in Text(String(n)).tag(n) }
                    }
                    .disabled(busy || hosted?.locked == true)
                }
                if hosted?.locked == true {
                    Text("This Bot already has a hosted session. Provider tools are fixed for that session, so these permissions are locked. Configure a new Bot for a different capability set.")
                        .font(.caption).foregroundStyle(.orange)
                }
                Text("This setting does not enable unrestricted internet, shell access to your phone, connected credentials, or remote tool execution without the separate source policies.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Section("MCP tool permissions") {
                Text("EUPHORIA's server verifies administrator rights, each Bot grant and the current source policy. A granted write still requires its separate approval.")
                    .font(.caption).foregroundStyle(.secondary)
                ForEach(availableTools) { tool in
                    Toggle(isOn: Binding(
                        get: { grants?.tools.contains(where: { $0.ref == tool.ref }) ?? false },
                        set: { value in Task { await setMCPGrant(tool.ref, value) } }
                    )) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tool.ref).font(.headline)
                            Text(tool.description).font(.caption).foregroundStyle(.secondary)
                            Text(tool.destructive ? "Destructive action: separate policy required" :
                                tool.effect == "write" ? "Write: one-time human approval required" : "Read")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(busy || grants == nil || tool.destructive)
                }
                if availableTools.isEmpty && !busy && error == nil {
                    Text("No server-advertised tools available. Connect a service first.")
                        .foregroundStyle(.secondary)
                }
                Text("Only administrators may change MCP tool grants. Changes to already-running provider sessions require reconciliation.")
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
            async let results = client.sourceSkills()
            async let owned = client.sourceBotGrants(botID: botID)
            async let servers = client.availableSourceConnections()
            async let configured = client.sourceHostedCapabilities(botID: botID)
            catalogue = try await results
            grants = try await owned
            hosted = try? await configured
            let discovered = try await servers
            availableTools = discovered.flatMap(\.tools)
                .filter { !$0.ref.isEmpty }
                .sorted { $0.ref < $1.ref }
            self.error = nil
        } catch {
            self.error = "Bot tools and skills cannot be verified. The previous grant state will not be assumed current."
            grants = nil
            hosted = nil
            availableTools = []
        }
    }
    private func updateHosted(sandbox: Bool? = nil, webSearch: Bool? = nil, browser: Bool? = nil, delegation: Bool? = nil,
                              maxSubagents: Int? = nil) async {
        guard !busy, let previous = hosted, !previous.locked else { return }
        busy = true
        defer { busy = false }
        let delegate = delegation ?? previous.capabilities.delegation
        let wanted = SourceHostedCapabilities(
            sandbox: sandbox ?? previous.capabilities.sandbox,
            webSearch: webSearch ?? previous.capabilities.webSearch,
            browser: browser ?? previous.capabilities.browser,
            delegation: delegate,
            maxConcurrentSubagents: delegate ? (maxSubagents ?? previous.capabilities.maxConcurrentSubagents) : 1)
        do {
            _ = try await client.updateSourceHostedCapabilities(botID: botID, capabilities: wanted)
            hosted = try await client.sourceHostedCapabilities(botID: botID)
            self.error = nil
        } catch {
            hosted = nil
            self.error = "Hosted permission change could not be confirmed. Refresh the source state. Existing managed sessions cannot be reconfigured."
        }
    }
    private func setMCPGrant(_ ref: String, _ enabled: Bool) async {
        guard !busy, grants != nil else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.setSourceMCPGrant(botID: botID, ref: ref, enabled: enabled)
            grants = try await client.sourceBotGrants(botID: botID)
            self.error = nil
        } catch {
            grants = nil
            self.error = "Tool grant change was refused or could not be confirmed. Refresh permissions before acting again. MCP changes require administrator access."
        }
    }
    private func setSkill(_ slug: String, _ enabled: Bool) async {
        guard !busy, grants != nil else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.setSourceSkillGrant(botID: botID, slug: slug, enabled: enabled)
            grants = try await client.sourceBotGrants(botID: botID)
            self.error = nil
        } catch {
            grants = nil
            self.error = "The original permission change is uncertain. Refresh the source grants before trying again."
        }
    }
}
