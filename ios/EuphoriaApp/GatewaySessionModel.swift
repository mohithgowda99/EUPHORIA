import Foundation
import SwiftData
import Observation

/// Native local archive + gateway transport state. No provider credentials or alternate domain store.
@MainActor @Observable
final class GatewaySessionModel {
    private(set) var state: VisualState?
    private(set) var phase = "ready"
    private(set) var verificationMode = "unverified"
    var hasPending: Bool { pendingRequestID != nil || !(state?.pending.isEmpty ?? true) }
    private(set) var errorMessage: String?
    private(set) var isBusy = false
    private let client: GatewayClient
    private let repository: VisualSnapshotRepository
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
        self.prefix = "euphoria.gateway." + storageKey; self.preferences = preferences
    }
    func restore() async {
        do {
            if let surfaceID = preferences.string(forKey: prefix + ".surface") { state = try repository.load(surfaceID: surfaceID) }
        } catch { errorMessage = "Could not read the saved workspace."; return }
        await refresh()
    }
    func start(message: String) async {
        guard !isBusy, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard pendingRequestID == nil else { errorMessage = "Refresh the pending request before starting another task."; return }
        isBusy = true; defer { isBusy = false }
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
        isBusy = true; defer { isBusy = false }
        do {
            if let requestID = pendingRequestID {
                let response = try await client.recover(requestID: requestID)
                try accept(response)
                if response.sessionID != nil || response.phase == "cancelled" { pendingRequestID = nil }
                else { return }
            }
            if let sessionID { try accept(try await client.refresh(sessionID: sessionID)) }
            errorMessage = nil
        } catch is CancellationError { }
        catch { errorMessage = error.localizedDescription }
    }
    /// Explicit resolution records cancellation at the gateway before unlocking an unsent intent.
    func resolvePending() async {
        guard !isBusy else { return }
        isBusy = true; defer { isBusy = false }
        do {
            if let id = pendingRequestID {
                let response = try await client.cancelCreation(requestID: id)
                try accept(response)
                if response.sessionID != nil || response.phase == "cancelled" { pendingRequestID = nil }
            } else if let state, !state.pending.isEmpty {
                try accept(try await client.reconcile(surfaceID: state.surface.surfaceID, pendingActionIDs: state.pending.map(\.id)))
            }
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
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
            defer { isBusy = false }
            do { try accept(try await client.submit(action)); errorMessage = nil }
            catch { errorMessage = error.localizedDescription }
        }
    }
    private func accept(_ response: GatewayEnvelope) throws {
        if let id = response.sessionID, id != sessionID, response.surface == nil {
            state = nil
            preferences.removeObject(forKey: prefix + ".surface")
        }
        if let incoming = response.surface {
            var next: VisualState
            if let current = state, current.surface.surfaceID == incoming.surfaceID { next = current }
            else { next = try repository.load(surfaceID: incoming.surfaceID) ?? VisualState(surface: incoming) }
            try next.reconcile(incoming, acknowledgedActionIDs: response.acknowledgedActionIDs,
                resolvedNodeIDs: response.resolvedNodeIDs, rejectedActionIDs: response.rejectedActionIDs)
            try repository.save(next)
            state = next
            preferences.set(incoming.surfaceID, forKey: prefix + ".surface")
        }
        if let id = response.sessionID { sessionID = id }
        phase = response.phase
        verificationMode = response.verificationMode
    }
}
