import SwiftUI

/// M0/M1 native bootstrap, deliberately not a mock chat or feature-parity screen.
struct ContentView: View {
    @State private var serverAddress = ""
    @State private var probeState: ProbeState = .idle
    @State private var probeTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Section("Existing OpenBot deployment") {
                    TextField("https://openbot.example.com", text: $serverAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .onChange(of: serverAddress) { _, _ in
                            probeTask?.cancel()
                            probeState = .idle
                        }
                    Button("Check server capabilities") {
                        probeTask?.cancel()
                        probeTask = Task { await checkServer() }
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
        }
    }

    @MainActor
    private func checkServer() async {
        probeState = .loading
        do {
            let endpoint = try OpenBotEndpoint(serverAddress)
            let capabilities = try await OpenBotAPI().capabilities(at: endpoint)
            try Task.checkCancellation()
            probeState = .reachable(capabilities)
        } catch is CancellationError {
            probeState = .idle
        } catch {
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
