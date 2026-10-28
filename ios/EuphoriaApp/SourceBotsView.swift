import SwiftUI
import AuthenticationServices
import Combine

/// Sign-in browser supplied by iOS, never a WKWebView. The source Better Auth
/// expo() callback transports its verified cookie through openbotmobile://.
/// The cookie is accepted ONLY after the original /api/auth/get-session confirms it.
@MainActor
final class SourceSignInBrowser: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var callbackURL: URL?
    @Published var failureMessage: String?
    private var active: ASWebAuthenticationSession?

    func open(_ url: URL) {
        callbackURL = nil
        failureMessage = nil
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "openbotmobile") { [weak self] returned, error in
            let failure = error == nil ? "Sign-in returned no session." : "Sign-in was cancelled or could not complete."
            Task { @MainActor [weak self] in
                self?.active = nil
                if let returned { self?.callbackURL = returned }
                else { self?.failureMessage = failure }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        active = session
        if !session.start() {
            active = nil
            failureMessage = "The secure sign-in window could not open."
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

/// Native view of the ORIGINAL /api/agents endpoint and source Better Auth.
/// It does not treat gateway sessions as Bots or create a second Bot database.
struct SourceBotsView: View {
    @StateObject private var browser = SourceSignInBrowser()
    @State private var serverOrigin = UserDefaults.standard.string(forKey: "euphoria.openduet.origin") ?? ""
    @State private var currentEndpoint: OpenBotEndpoint?
    @State private var client: OpenDuetSourceAPI?
    @State private var user: SourceUser?
    @State private var providers: [String] = []
    @State private var bots: [SourceBot] = []
    @State private var builtInAvailable = false
    @State private var errorMessage: String?
    @State private var loading = false
    @State private var createSheet = false
    @State private var newName = ""
    @State private var newTitle = ""
    @State private var newInstructions = ""

    var body: some View {
        List {
            if user == nil {
                Section("OpenDuet account") {
                    TextField("https://your-openduet-server.example", text: $serverOrigin)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                    Button("Connect to original OpenDuet server") {
                        Task { await connect() }
                    }
                    .disabled(loading || serverOrigin.isEmpty)
                    if let currentEndpoint {
                        Text(currentEndpoint.baseURL.absoluteString)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if providers.isEmpty {
                            Text("No native sign-in provider was advertised. Enable the original Better Auth native OAuth callback on this deployment.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(providers, id: \.self) { provider in
                            Button("Sign in with " + provider.capitalized) {
                                Task { await beginSignIn(provider: provider) }
                            }
                            .disabled(loading)
                        }
                    }
                }
            } else if let user {
                Section {
                    LabeledContent("Signed in", value: user.name ?? user.email)
                    Button("Forget sign-in on this device", role: .destructive) {
                        forgetThisDevice()
                    }
                }
                Section("Your Bots") {
                    ForEach(bots) { bot in
                        NavigationLink {
                            if let client {
                                SourceBotDetailView(client: client, botID: bot.id) {
                                    Task { await reloadBots() }
                                }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(bot.name).font(.headline)
                                    if bot.pinned { Image(systemName: "pin.fill").font(.caption) }
                                }
                                if !bot.title.isEmpty { Text(bot.title).font(.subheadline).foregroundStyle(.secondary) }
                                if bot.hidden { Text("Hidden").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                    if bots.isEmpty && !loading {
                        ContentUnavailableView("No Bots", systemImage: "person.crop.circle.badge.plus",
                            description: Text("Create a Bot in the original OpenDuet service."))
                    }
                }
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red).textSelection(.enabled)
                    Button("Retry read") { Task { await connect() } }
                }
            }
            if let browserError = browser.failureMessage {
                Text(browserError).foregroundStyle(.secondary)
            }
            if loading { ProgressView("Connecting to OpenDuet…") }
        }
        .navigationTitle("Bots")
        .toolbar {
            if user != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button("New Bot", systemImage: "plus") { createSheet = true }
                        .disabled(loading || !builtInAvailable)
                }
            }
        }
        .sheet(isPresented: $createSheet) {
            NavigationStack {
                Form {
                    TextField("Bot name", text: $newName)
                    TextField("Short title", text: $newTitle)
                    TextField("What this Bot does and how it behaves", text: $newInstructions, axis: .vertical)
                        .lineLimit(4...10)
                    Text("New Bots are private by default. Their instructions and permissions are stored in the original OpenDuet account service.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .navigationTitle("New Bot")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { createSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") { createSheet = false; Task { await createBot() } }
                            .disabled(loading || newName.isEmpty || newTitle.isEmpty || newInstructions.isEmpty)
                    }
                }
            }
        }
        .refreshable { await connect() }
        .task { await connect() }
        .onChange(of: browser.callbackURL) { _, url in
            if let url { Task { await finishSignIn(url) } }
        }
    }

    private func connect() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let origin = try OpenBotEndpoint(serverOrigin)
            currentEndpoint = origin
            let publicAPI = OpenDuetSourceAPI(endpoint: origin)
            let capabilities = try await publicAPI.capabilities()
            providers = capabilities.authProviders?.filter { ["google", "microsoft", "okta"].contains($0) } ?? []
            UserDefaults.standard.set(origin.baseURL.absoluteString, forKey: "euphoria.openduet.origin")
            if let storedCookie = SourceSessionKeychain.load(origin: origin.baseURL) {
                let signed = OpenDuetSourceAPI(endpoint: origin, cookie: storedCookie)
                do {
                    let account = try await signed.sourceSession()
                    client = signed
                    user = account.user
                    let options = try await signed.botCapabilities()
                    builtInAvailable = options.builtInAvailable
                    bots = try await signed.bots()
                    errorMessage = nil
                } catch SourceAPIError.unauthenticated {
                    SourceSessionKeychain.clear(origin: origin.baseURL)
                    client = nil; user = nil; bots = []
                    errorMessage = "This sign-in expired. Please authenticate again."
                }
            } else {
                client = nil; user = nil; bots = []; builtInAvailable = false
                errorMessage = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func beginSignIn(provider: String) async {
        guard !loading, let currentEndpoint else { return }
        loading = true
        defer { loading = false }
        do {
            let url = try await OpenDuetSourceAPI(endpoint: currentEndpoint).socialAuthorizationURL(provider: provider)
            browser.open(url)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func finishSignIn(_ callback: URL) async {
        guard !loading, let currentEndpoint else { return }
        loading = true
        defer { loading = false }
        do {
            let cookie = try SourceSessionCookie.extract(from: callback)
            let source = OpenDuetSourceAPI(endpoint: currentEndpoint, cookie: cookie)
            let account = try await source.sourceSession()
            guard !account.user.id.isEmpty else { throw SourceAPIError.invalidResponse }
            try SourceSessionKeychain.store(cookie, origin: currentEndpoint.baseURL)
            client = source
            user = account.user
            builtInAvailable = try await source.botCapabilities().builtInAvailable
            bots = try await source.bots()
            errorMessage = nil
        } catch {
            errorMessage = "Original OpenDuet sign-in could not be verified. No session was stored."
        }
    }

    private func reloadBots() async {
        guard !loading, let client else { return }
        loading = true
        defer { loading = false }
        do { bots = try await client.bots(); errorMessage = nil }
        catch { errorMessage = error.localizedDescription }
    }

    private func createBot() async {
        guard !loading, let client else { return }
        loading = true
        defer { loading = false }
        do {
            let payload = try SourceBotInput(name: newName, title: newTitle, instructions: newInstructions)
            _ = try await client.createBot(payload)
            bots = try await client.bots()
            newName = ""; newTitle = ""; newInstructions = ""
            errorMessage = nil
        } catch {
            // A transport failure after POST may have created the Bot. Refresh
            // the original roster, never blindly POST another identical Bot.
            errorMessage = "Bot creation was not confirmed. Refresh the original roster before trying again."
        }
    }

    private func forgetThisDevice() {
        if let currentEndpoint { SourceSessionKeychain.clear(origin: currentEndpoint.baseURL) }
        client = nil; user = nil; bots = []; builtInAvailable = false
        errorMessage = "The saved login was cleared on this iPhone. Remote account sessions may remain active until revoked in OpenDuet."
    }
}

private struct SourceBotDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let client: OpenDuetSourceAPI
    let botID: String
    let onSaved: () -> Void
    @State private var bot: SourceBot?
    @State private var name = ""
    @State private var title = ""
    @State private var instructions = ""
    @State private var editing = false
    @State private var showDeleteConfirmation = false
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            if let bot {
                Section("Bot") {
                    Text(bot.name).font(.headline)
                    Text(bot.title).foregroundStyle(.secondary)
                    Text(bot.roleDescription).textSelection(.enabled)
                    LabeledContent("Visibility", value: bot.visibility)
                    if bot.systemOwned { Text("Managed by your OpenDuet deployment").font(.caption) }
                }
                Section("Manage") {
                    Button(bot.pinned ? "Unpin" : "Pin") { Task { await mutate { try await client.pinBot(id: botID, pinned: !bot.pinned) } } }
                    Button(bot.hidden ? "Show" : "Hide") { Task { await mutate { try await client.hideBot(id: botID, hidden: !bot.hidden) } } }
                    if bot.canManage {
                        Button("Edit Bot") {
                            name = bot.name; title = bot.title; instructions = bot.roleDescription
                            editing = true
                        }
                        Button("Duplicate Bot") {
                            Task { await mutate { _ = try await client.duplicateBot(id: botID) } }
                        }
                        Button("Delete Bot", role: .destructive) { showDeleteConfirmation = true }
                    }
                }
                .disabled(busy)
                if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
            } else if busy {
                ProgressView("Loading Bot…")
            } else {
                Text(errorMessage ?? "Bot not found.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle(bot?.name ?? "Bot")
        .refreshable { await refresh() }
        .task(id: botID) { await refresh() }
        .alert("Delete this Bot?", isPresented: $showDeleteConfirmation) {
            Button("Delete Bot", role: .destructive) {
                Task {
                    await mutate {
                        try await client.deleteBot(id: botID)
                        dismiss()
                    }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("OpenDuet will revoke this Bot's access. This cannot be undone from this screen.")
        }
        .sheet(isPresented: $editing) {
            NavigationStack {
                Form {
                    TextField("Name", text: $name)
                    TextField("Title", text: $title)
                    TextField("Instructions", text: $instructions, axis: .vertical)
                        .lineLimit(4...10)
                }
                .navigationTitle("Edit Bot")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editing = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            editing = false
                            Task {
                                await mutate {
                                    let changes = try SourceBotInput(name: name, title: title, instructions: instructions)
                                    _ = try await client.updateBot(id: botID, input: changes)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            bot = try await client.bot(id: botID)
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }
    private func mutate(_ operation: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await operation()
            bot = try? await client.bot(id: botID)
            onSaved()
            errorMessage = nil
        } catch {
            errorMessage = "Operation could not be confirmed. Refresh the original Bot record; it will not be repeated automatically."
        }
    }
}
