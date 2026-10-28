import Foundation
import SwiftData
import Observation
import CryptoKit

/// Native local archive + gateway transport state. No provider credentials or alternate domain store.
@MainActor @Observable
final class GatewaySessionModel {
    private(set) var conversation: ConversationArchive?
    private(set) var sessions: [GatewayEnvelope] = []
    private(set) var isLoadingSessions = false
    private(set) var sessionsError: String?
    private(set) var hasMoreSessions = false
    private var sessionsCursor: String?
    var hasPendingCreation: Bool { pendingRequestID != nil }
    private(set) var gatewayFailure: GatewayFailure?
    private(set) var historyError: String?
    var hasSession: Bool { sessionID != nil }
    private(set) var state: VisualState?
    private(set) var phase = "ready"
    private(set) var verificationMode = "unverified"
    var hasPending: Bool { pendingRequestID != nil || !(state?.pending.isEmpty ?? true) || !(conversation?.pendingOperations.isEmpty ?? true) }
    private(set) var errorMessage: String?
    private(set) var isBusy = false
    private(set) var liveSessionID: String?
    private(set) var liveStatus = "Not connected"
    @ObservationIgnored private var publicationSession: String?
    @ObservationIgnored private var publication = 0
    @ObservationIgnored private var bufferedLiveUpdate: GatewayLiveUpdate?
    private let client: GatewayClient
    /// Reuse the existing authenticated transport for source Tasks acceptance.
    /// No second networking client, task store or journal.
    var taskServiceClient: GatewayClient { client }
    private let repository: VisualSnapshotRepository
    private let conversationRepository: ConversationSnapshotRepository
    private let scope: String
    var storageScope: String { scope }
    private let preferences: UserDefaults
    private let prefix: String
    private var sessionID: String? {
        get { preferences.string(forKey: prefix + ".session") }
        set { preferences.set(newValue, forKey: prefix + ".session") }
    }
    private var pendingRequestID: String? {
        get { preferences.string(forKey: prefix + ".request") }
        set { preferences.set(newValue, forKey: prefix + ".request") }
    }
    init(client: GatewayClient, context: ModelContext, storageKey: String, preferences: UserDefaults = .standard) {
        self.client = client; repository = VisualSnapshotRepository(context: context)
        conversationRepository = ConversationSnapshotRepository(context: context); scope = storageKey
        self.prefix = "euphoria.gateway." + storageKey; self.preferences = preferences
        liveSessionID = preferences.string(forKey: prefix + ".session")
    }
    static func configured(context: ModelContext) throws -> GatewaySessionModel {
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        guard let url = environment["EUPHORIA_GATEWAY_URL"], let token = environment["EUPHORIA_GATEWAY_TOKEN"] else { throw GatewayClientError.invalidConnection }
        let connection = try GatewayConnection(url: url, token: token, allowLoopback: true)
        let key = SHA256.hash(data: Data((url + "\0" + token).utf8)).map { String(format: "%02x", $0) }.joined()
        return GatewaySessionModel(client: GatewayClient(connection: connection), context: context, storageKey: key)
        #else
        throw GatewayClientError.invalidConnection
        #endif
    }
    func restore() async {
        do {
            if let surfaceID = preferences.string(forKey: prefix + ".surface") { state = try repository.load(surfaceID: surfaceID) }
            if let sessionID { conversation = try conversationRepository.load(scope: scope, sessionID: sessionID) }
        } catch { errorMessage = "Could not read the saved workspace."; return }
        await refresh()
    }
    func start(message: String) async {
        guard !isBusy, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard pendingRequestID == nil else { errorMessage = "Refresh the pending request before starting another task."; return }
        isBusy = true; defer { isBusy = false; drainLiveUpdate() }
        let id = UUID().uuidString
        // Persist the submission identity before HTTP. A lost response must never create another session automatically.
        pendingRequestID = id
        do {
            let response = try await client.create(message: message, requestID: id)
            try accept(response)
            if response.sessionID != nil { pendingRequestID = nil }
            if let sessionID = response.sessionID { try accept(try await client.refresh(sessionID: sessionID)) }
            errorMessage = nil
        } catch {
            if case GatewayClientError.httpStatus(let code) = error, [400, 401, 403, 404, 413, 422].contains(code) { pendingRequestID = nil }
            errorMessage = error.localizedDescription
        }
    }
    func refresh() async {
        guard !isBusy else { return }
        isBusy = true; defer { isBusy = false; drainLiveUpdate() }
        do {
            if let requestID = pendingRequestID {
                let response = try await client.recover(requestID: requestID)
                try accept(response)
                if response.sessionID != nil || response.phase == "cancelled" { pendingRequestID = nil }
                else { return }
            }
            if let sessionID {
                try accept(try await client.refresh(sessionID: sessionID))
                if var archive = conversation, !archive.pendingOperations.isEmpty {
                    try archive.reconcile(try await client.inputReceipts(sessionID: sessionID).operations)
                    try saveConversation(archive)
                }
            }
            errorMessage = nil
        } catch is CancellationError { }
        catch { errorMessage = error.localizedDescription }
    }
    /// Explicit resolution records cancellation at the gateway before unlocking an unsent intent.
    func resolvePending() async {
        guard !isBusy else { return }
        isBusy = true; defer { isBusy = false; drainLiveUpdate() }
        do {
            if let id = pendingRequestID {
                let response = try await client.cancelCreation(requestID: id)
                try accept(response)
                if response.sessionID != nil || response.phase == "cancelled" { pendingRequestID = nil }
            } else if let state, !state.pending.isEmpty {
                try accept(try await client.reconcile(surfaceID: state.surface.surfaceID, pendingActionIDs: state.pending.map(\.id)))
            }
            if let sessionID, var archive = conversation, !archive.pendingOperations.isEmpty {
                try archive.reconcile(try await client.inputReceipts(sessionID: sessionID,
                    resolving: archive.pendingOperations.map(\.id)).operations)
                try saveConversation(archive)
            }
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }
    func send(message: String) async {
        guard let sessionID else { await start(message: message); return }
        await sendInput(.message, message: message, sessionID: sessionID)
    }
    func cancel() async {
        guard let sessionID else { return }
        await sendInput(.cancel, sessionID: sessionID)
    }
    private func sendInput(_ kind: GatewayInputKind, message: String? = nil, sessionID: String) async {
        guard !isBusy else { return }
        isBusy = true; defer { isBusy = false; drainLiveUpdate() }
        do {
            var archive = try conversation ?? conversationRepository.load(scope: scope, sessionID: sessionID) ?? ConversationArchive(sessionID: sessionID)
            guard !archive.pendingOperations.contains(where: { $0.kind == kind }) else {
                errorMessage = "Resolve the pending input before sending another."; return
            }
            let input = GatewayInputIntent(id: UUID().uuidString, kind: kind, message: message)
            try archive.enqueue(input); try saveConversation(archive)
            let receipt: GatewayInputReceipt
            if kind == .message { receipt = try await client.sendMessage(sessionID: sessionID, message: message ?? "", id: input.id) }
            else { receipt = try await client.cancel(sessionID: sessionID, id: input.id) }
            try archive.reconcile([receipt]); try saveConversation(archive)
            errorMessage = receipt.phase == "rejected" ? "The provider rejected this input. You can send a corrected request." : nil
        } catch { errorMessage = error.localizedDescription }
    }
    func loadHistory(more: Bool = false) async {
        guard !isBusy, let sessionID else { return }
        isBusy = true; defer { isBusy = false; drainLiveUpdate() }
        do {
            var archive = try conversation ?? conversationRepository.load(scope: scope, sessionID: sessionID) ?? ConversationArchive(sessionID: sessionID)
            let page = try await client.history(sessionID: sessionID, after: more ? archive.nextCursor : nil)
            try archive.apply(page, reset: !more); try saveConversation(archive); historyError = nil
        } catch { historyError = "History is unavailable. Saved history remains on this device." }
    }
    func loadSessions(more: Bool = false) async {
        guard !isBusy, !isLoadingSessions else { return }
        if more && (!hasMoreSessions || sessionsCursor == nil) { return }
        isLoadingSessions = true; defer { isLoadingSessions = false }
        do {
            let page = try await client.listSessions(after: more ? sessionsCursor : nil)
            try Task.checkCancellation()
            if more {
                let existing = Set(sessions.compactMap(\.sessionID))
                sessions += page.sessions.filter { !existing.contains($0.sessionID ?? "") }
            } else { sessions = page.sessions }
            hasMoreSessions = page.hasMore; sessionsCursor = page.nextCursor; sessionsError = nil
        } catch is CancellationError { }
        catch { sessionsError = "Could not load tasks. Previously loaded tasks remain available." }
    }
    func selectSession(_ selected: GatewayEnvelope) async {
        guard !isBusy, let id = selected.sessionID, pendingRequestID == nil else { return }
        sessionID = id; liveSessionID = id; bufferedLiveUpdate = nil; state = nil; conversation = nil
        preferences.removeObject(forKey: prefix + ".surface")
        publicationSession = nil; publication = 0
        phase = selected.phase; verificationMode = selected.verificationMode; gatewayFailure = selected.failure
        do {
            if let incoming = selected.surface {
                state = try repository.load(surfaceID: incoming.surfaceID) ?? VisualState(surface: incoming)
                preferences.set(incoming.surfaceID, forKey: prefix + ".surface")
            }
            conversation = try conversationRepository.load(scope: scope, sessionID: id)
        } catch { historyError = "Could not read saved task." }
        await refresh(); await loadHistory()
    }
    func newConversation() {
        guard !isBusy, pendingRequestID == nil else { return }
        sessionID = nil; liveSessionID = nil; bufferedLiveUpdate = nil; state = nil; conversation = nil; phase = "ready"
        errorMessage = nil; historyError = nil; gatewayFailure = nil
        preferences.removeObject(forKey: prefix + ".surface")
    }
    private func saveConversation(_ archive: ConversationArchive) throws {
        try conversationRepository.save(archive, scope: scope); conversation = archive
    }
    func acknowledgeDisplayedSurface() {
        guard !isBusy, let state, state.requiresDisplayReceipt, let first = state.surface.nodes.first else { return }
        enact(first, kind: .displayed, values: [:])
    }
    /// Synchronous local publication happens before the asynchronous provider submission starts.
    func enact(_ node: VisualNode, kind: VisualActionKind, values: [String: VisualScalar]) {
        guard !isBusy, var next = state else { return }
        let action = VisualAction(id: UUID().uuidString, surfaceID: next.surface.surfaceID,
            expectedRevision: next.surface.revision, nodeID: node.id, kind: kind, values: values)
        do {
            try next.apply(action); try repository.save(next); state = next; errorMessage = nil
        } catch { errorMessage = "Could not save this change. Nothing was sent."; return }
        if kind == .setField { return }
        isBusy = true
        Task {
            defer { isBusy = false; drainLiveUpdate() }
            do { try accept(try await client.submit(action)); errorMessage = nil }
            catch { errorMessage = error.localizedDescription }
        }
    }
    /// A single latest projection waits behind an in-flight local operation. No intents are replayed.
    func receiveLiveUpdate(_ update: GatewayLiveUpdate, sessionID sourceID: String) throws {
        guard !Task.isCancelled, sessionID == sourceID, update.snapshot.sessionID == sourceID else { return }
        if isBusy {
            if (update.snapshot.publication ?? 0) > (bufferedLiveUpdate?.snapshot.publication ?? 0) { bufferedLiveUpdate = update }
            return
        }
        var archive = try conversation ?? conversationRepository.load(scope: scope, sessionID: sourceID) ?? ConversationArchive(sessionID: sourceID)
        try archive.mergeLatest(update.history)
        try archive.reconcile(update.inputs.operations)
        guard try accept(update.snapshot) else { return }
        try saveConversation(archive)
        historyError = nil
    }
    private func drainLiveUpdate() {
        guard let update = bufferedLiveUpdate else { return }
        bufferedLiveUpdate = nil
        do { try receiveLiveUpdate(update, sessionID: update.snapshot.sessionID ?? "") }
        catch { liveStatus = "Live update unavailable; refresh to recover" }
    }
    func followCurrentSession() async {
        guard let id = liveSessionID else { return }
        var delay: UInt64 = 1
        while !Task.isCancelled, sessionID == id, phase != "failed" {
            liveStatus = delay == 1 ? "Connecting live updates…" : "Reconnecting live updates…"
            do {
                try await client.watch(sessionID: id) { [weak self] update in
                    try await self?.receiveLiveUpdate(update, sessionID: id)
                    await self?.markLive(id)
                }
            } catch {
                guard !Task.isCancelled, sessionID == id else { return }
                if case GatewayClientError.httpStatus(let code) = error, [401,403,404,503].contains(code) {
                    liveStatus = "Live updates unavailable; refresh manually"; return
                }
                liveStatus = "Reconnecting live updates…"
            }
            guard phase != "failed" else { break }
            do { try await Task.sleep(nanoseconds: delay * 1_000_000_000) } catch { return }
            delay = min(delay * 2, 15)
        }
    }
    private func markLive(_ id: String) {
        if !Task.isCancelled, sessionID == id { liveStatus = "Live updates connected" }
    }
    @discardableResult
    private func accept(_ response: GatewayEnvelope) throws -> Bool {
        if let number = response.publication, response.sessionID == publicationSession, number <= publication { return false }
        if let id = response.sessionID, id != sessionID, response.surface == nil {
            state = nil; conversation = nil
            preferences.removeObject(forKey: prefix + ".surface")
        }
        if let incoming = response.surface {
            var next: VisualState
            if let current = state, current.surface.surfaceID == incoming.surfaceID { next = current }
            else { next = try repository.load(surfaceID: incoming.surfaceID) ?? VisualState(surface: incoming) }
            try next.reconcile(incoming, acknowledgedActionIDs: response.acknowledgedActionIDs,
                resolvedNodeIDs: response.resolvedNodeIDs, rejectedActionIDs: response.rejectedActionIDs, displayAcknowledged: response.displayAcknowledged)
            try repository.save(next)
            state = next
            preferences.set(incoming.surfaceID, forKey: prefix + ".surface")
        }
        if let id = response.sessionID { sessionID = id; liveSessionID = id }
        if let number = response.publication { publicationSession = response.sessionID; publication = number }
        gatewayFailure = response.failure
        phase = response.phase
        verificationMode = response.verificationMode
        return true
    }
}
