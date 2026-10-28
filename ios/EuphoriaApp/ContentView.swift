import SwiftUI

/// Phase-one navigation has Chat as home, not a list of provider sessions
/// masquerading as OpenDuet Tasks. All ordinary screens remain native SwiftUI.
/// These integration screens still require a configured development gateway;
/// production OpenDuet sign-in and source Bot binding are not yet implemented.
struct ContentView: View {
    var body: some View {
        TabView {
            NavigationStack {
                SourceConversationsHomeView()
            }
            .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }

            NavigationStack {
                SourceTasksView()
            }
            .tabItem { Label("Tasks", systemImage: "checklist") }

            NavigationStack {
                SourceBotsView()
            }
            .tabItem { Label("Bots", systemImage: "person.2.crop.square.stack") }

            NavigationStack {
                SourceMemoryView()
            }
            .tabItem { Label("Memory", systemImage: "brain.head.profile") }

            NavigationStack {
                SourceApprovalsView()
            }
            .tabItem { Label("Approvals", systemImage: "checkmark.shield") }
        }
    }
}


/// M0/M1 native bootstrap, deliberately not a mock chat or feature-parity screen.
struct DevelopmentToolsView: View {
    @State private var serverAddress = ""
    @State private var probeState: ProbeState = .idle
    @State private var probeTask: Task<Void, Never>?
    @State private var probeID = UUID()

    var body: some View {
        NavigationStack {
            Form {
                #if DEBUG
                Section("Visual contract proof") {
                    NavigationLink("Nested A2UI composition study") { VisualFixtureView(kind:.composition) }
                    NavigationLink("A2UI deployment choice study") { VisualFixtureView(kind:.compositionChoice) }
                    NavigationLink("Open gateway session") { GatewaySessionView() }
                    NavigationLink("Real Tasks service acceptance") { NativeTaskAcceptanceView() }
                    NavigationLink("Open A2UI source form fixture") { VisualFixtureView(kind: .a2uiForm) }
                    NavigationLink("Open gallery and artifact fixtures") { VisualFixtureView(kind: .gallery) }
                    NavigationLink("Open source-derived UI fixtures") {
                        VisualFixtureView()
                    }
                }
                #endif
                Section("Existing OpenBot deployment") {
                    TextField("https://openbot.example.com", text: $serverAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .onChange(of: serverAddress) { _, _ in
                            probeTask?.cancel()
                            probeID = UUID()
                            probeState = .idle
                        }
                    Button("Check server capabilities") {
                        probeTask?.cancel()
                        let nextID = UUID()
                        probeID = nextID
                        probeTask = Task { await checkServer(id: nextID) }
                    }
                    .disabled(serverAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              || probeState.isLoading)
                }
                Section("Connection") {
                    switch probeState {
                    case .idle:
                        Text("No deployment checked.")
                            .foregroundStyle(.secondary)
                    case .loading:
                        ProgressView("Checking the existing server…")
                    case .failed(let message):
                        Text(message)
                            .foregroundStyle(.red)
                            .textSelection(.enabled)
                    case .reachable(let capabilities):
                        Label("Server capabilities received", systemImage: "checkmark.circle")
                        LabeledContent("Runtime", value: capabilities.mode ?? "Not advertised")
                        LabeledContent(
                            "Durable history",
                            value: capabilities.durableHistory.map { $0 ? "Advertised" : "Not advertised" } ?? "Unknown"
                        )
                        LabeledContent(
                            "Generative UI",
                            value: capabilities.generativeUi.map { $0 ? "Available" : "Unavailable" } ?? "Unknown"
                        )
                        if let providers = capabilities.authProviders, !providers.isEmpty {
                            LabeledContent("Auth providers", value: providers.joined(separator: ", "))
                        }
                    }
                }
                Section("Integration status") {
                    Text("This is a real server connectivity check, not an authenticated session.")
                    Text("Agent runs, frontend tools, approvals and persisted history remain gated on the reviewed native authentication and AG-UI integration.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Euphoria")
        }
        .onDisappear {
            probeTask?.cancel()
            probeID = UUID()
        }
    }

    @MainActor
    private func checkServer(id: UUID) async {
        guard probeID == id else { return }
        probeState = .loading
        do {
            let endpoint = try OpenBotEndpoint(serverAddress)
            let capabilities = try await OpenBotAPI().capabilities(at: endpoint)
            try Task.checkCancellation()
            guard probeID == id else { return }
            probeState = .reachable(capabilities)
        } catch is CancellationError {
            if probeID == id { probeState = .idle }
        } catch {
            guard probeID == id else { return }
            probeState = .failed(error.localizedDescription)
        }
    }
}

private enum ProbeState {
    case idle
    case loading
    case reachable(DeploymentCapabilities)
    case failed(String)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

#Preview {
    ContentView()
}
