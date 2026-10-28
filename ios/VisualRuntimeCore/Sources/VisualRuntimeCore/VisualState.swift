import Foundation

/// Codable snapshot: persisted by SwiftData on iOS, portable for deterministic contract tests.
/// Unacknowledged actions stay queued across relaunch; never replay effects without gateway idempotency.
public struct VisualState: Codable, Equatable, Sendable {
    public private(set) var surface: VisualSurface
    public private(set) var values: [String: VisualScalar] = [:]
    public private(set) var pending: [VisualAction] = []

    public private(set) var resolvedNodeIDs: Set<String> = []
    public init(surface: VisualSurface) { self.surface = surface }
    private enum CodingKeys: String, CodingKey { case surface, values, pending, resolvedNodeIDs }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        surface = try c.decode(VisualSurface.self, forKey: .surface)
        values = try c.decode([String: VisualScalar].self, forKey: .values)
        pending = try c.decode([VisualAction].self, forKey: .pending)
        resolvedNodeIDs = try c.decodeIfPresent(Set<String>.self, forKey: .resolvedNodeIDs) ?? []
        guard resolvedNodeIDs.isSubset(of: Set(surface.nodes.map(\.id))) else { throw VisualContractError.invalidSurface }
    }

    public mutating func apply(_ action: VisualAction) throws {
        try surface.validate()
        guard action.surfaceID == surface.surfaceID, action.expectedRevision == surface.revision,
              !action.id.isEmpty else { throw VisualContractError.staleRevision }
        if pending.contains(where: { $0.id == action.id }) { throw VisualContractError.duplicateAction }
        guard let node = surface.nodes.first(where: { $0.id == action.nodeID }) else {
            throw VisualContractError.invalidAction
        }
        // Decisions are one-shot until explicitly acknowledged, not a toggle that can trigger twice.
        if [.choose, .decide, .submitForm, .displayed].contains(action.kind) &&
            pending.contains(where: { $0.nodeID == action.nodeID && $0.kind == action.kind }) {
            throw VisualContractError.duplicateAction
        }
        guard !resolvedNodeIDs.contains(node.id) else { throw VisualContractError.duplicateAction }
        let prefix = node.id + "."
        if node.kind == .askForm && action.kind == .setField &&
            pending.contains(where: { $0.nodeID == node.id && $0.kind == .submitForm }) {
            throw VisualContractError.duplicateAction
        }
        if node.kind == .askApproval && action.kind == .setField && pending.contains(where: { $0.nodeID == node.id && $0.kind == .decide }) {
            throw VisualContractError.duplicateAction
        }
        switch (node.kind, action.kind) {
        case (_, .displayed):
            guard requiresDisplayReceipt, node.id == surface.nodes.first?.id, action.values.isEmpty else { throw VisualContractError.invalidAction }
            values["$displayReceipt@" + String(surface.revision)] = .flag(true)
        case (.askApproval, .setField):
            guard action.values.count == 1, let note = action.values["note"]?.string, note.count <= 2000 else { throw VisualContractError.invalidAction }
            values[approvalNoteKey(nodeID: node.id)] = .text(note)
        case (.askForm, .setField):
            guard action.values.count == 1, let (key, value) = action.values.first,
                  let field = node.fields?.first(where: { $0.id == key }),
                  let raw = value.string, raw.count <= 2000 else { throw VisualContractError.invalidAction }
            if field.type == .select && !(field.options ?? []).contains(raw) && !raw.isEmpty {
                throw VisualContractError.invalidAction
            }
            values[prefix + key] = .text(raw)
        case (.askForm, .submitForm):
            guard let fields = node.fields else { throw VisualContractError.invalidAction }
            var typed: [String: VisualScalar] = [:]
            for field in fields {
                let raw = (values[prefix + field.id]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if raw.isEmpty {
                    if field.required { throw VisualContractError.invalidAction }
                    continue
                }
                if raw.count > 2000 { throw VisualContractError.invalidAction }
                if field.type == .email && (!raw.contains("@") || raw.contains(" ")) {
                    throw VisualContractError.invalidAction
                }
                if field.type == .select && !(field.options ?? []).contains(raw) {
                    throw VisualContractError.invalidAction
                }
                if field.type == .number {
                    guard let number = Double(raw), number.isFinite,
                          field.min.map({ number >= $0 }) ?? true,
                          field.max.map({ number <= $0 }) ?? true else { throw VisualContractError.invalidAction }
                    typed[field.id] = .number(number)
                } else {
                    typed[field.id] = .text(raw)
                }
            }
            guard typed == action.values else { throw VisualContractError.invalidAction }
        case (.askChoice, .choose):
            guard let choice = action.values["choice"]?.string,
                  let option = node.options?.first(where: { $0.id == choice }),
                  action.values["label"] == .text(option.label), action.values.count == 2 else {
                throw VisualContractError.invalidAction
            }
            values[node.id] = .text(choice)
        case (.askApproval, .decide):
            guard let decision = action.values["decision"]?.string,
                  ["approved", "declined"].contains(decision),
                  Set(action.values.keys).isSubset(of: ["decision", "note"]),
                  (!action.values.keys.contains("note") || action.values["note"]?.string.map { $0.count <= 2000 } == true) else {
                throw VisualContractError.invalidAction
            }
            values[node.id] = .text(decision)
        case (.pageChecklist, .toggle):
            guard let key = action.values["item"]?.string,
                  node.items?.contains(where: { $0.id == key }) == true,
                  let checked = action.values["checked"]?.bool, action.values.count == 2 else {
                throw VisualContractError.invalidAction
            }
            values[prefix + key] = .flag(checked)
        default:
            // showChecklist is deliberately reporting-only; it must never mutate.
            throw VisualContractError.invalidAction
        }
        if action.kind != .setField { pending.append(action) } // Draft form edits are local; submit is the single tool result.
    }

    /// Only a server response may advance revision or clear delivered actions.
    public mutating func reconcile(_ next: VisualSurface, acknowledgedActionIDs: Set<String>, resolvedNodeIDs: Set<String> = [], rejectedActionIDs: Set<String> = [], displayAcknowledged: Bool = false) throws {
        try next.validate()
        guard next.surfaceID == surface.surfaceID, next.revision >= surface.revision,
              next.revision != surface.revision || next == surface else {
            throw VisualContractError.staleRevision
        }
        guard resolvedNodeIDs.isSubset(of: Set(next.nodes.map(\.id))) else { throw VisualContractError.invalidSurface }
        let rejected = pending.filter { rejectedActionIDs.contains($0.id) }
        let acknowledged = pending.filter { acknowledgedActionIDs.contains($0.id) }
        pending.removeAll { acknowledgedActionIDs.contains($0.id) || rejectedActionIDs.contains($0.id) }
        for action in rejected where action.kind == .displayed {
            if !pending.contains(where: { $0.kind == .displayed && $0.expectedRevision == action.expectedRevision }) {
                values.removeValue(forKey: "$displayReceipt@" + String(action.expectedRevision))
            }
        }
        for action in rejected where [.choose, .decide].contains(action.kind) {
            if !pending.contains(where: { $0.nodeID == action.nodeID }) { values.removeValue(forKey: action.nodeID) }
        }
        for action in acknowledged where action.kind == .toggle {
            guard let item = action.values["item"]?.string else { continue }
            let laterEdit = pending.contains { $0.nodeID == action.nodeID && $0.kind == .toggle && $0.values["item"]?.string == item }
            if !laterEdit { values.removeValue(forKey: action.nodeID + "." + item) }
        }

        self.resolvedNodeIDs = resolvedNodeIDs
        surface = next
        if displayAcknowledged { values["$displayReceipt@" + String(next.revision)] = .flag(true) }
    }

    public var requiresDisplayReceipt: Bool {
        surface.nodes.allSatisfy { [.showChecklist, .gallery, .htmlArtifact].contains($0.kind) } &&
            values["$displayReceipt@" + String(surface.revision)] != .flag(true)
    }
    private func approvalNoteKey(nodeID: String) -> String { nodeID + ".approvalNote@" + String(surface.revision) }
    public func approvalNote(nodeID: String) -> String {
        guard surface.nodes.contains(where: { $0.id == nodeID && $0.kind == .askApproval }) else { return "" }
        return values[approvalNoteKey(nodeID: nodeID)]?.string ?? ""
    }

    public func proposedFormValues(nodeID: String) throws -> [String: VisualScalar] {
        guard let node = surface.nodes.first(where: { $0.id == nodeID && $0.kind == .askForm }),
              let fields = node.fields else { throw VisualContractError.invalidAction }
        var out: [String: VisualScalar] = [:]
        for field in fields {
            let raw = (values[node.id + "." + field.id]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { continue }
            if field.type == .number {
                guard let number = Double(raw), number.isFinite else { throw VisualContractError.invalidAction }
                out[field.id] = .number(number)
            } else { out[field.id] = .text(raw) }
        }
        return out
    }
}
