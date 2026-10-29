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
        if [.askForm,.sourceComposition].contains(node.kind) && action.kind == .setField &&
            pending.contains(where: { $0.nodeID == node.id && $0.kind == .submitForm }) {
            throw VisualContractError.duplicateAction
        }
        if node.kind == .askApproval && action.kind == .setField && pending.contains(where: { $0.nodeID == node.id && $0.kind == .decide }) {
            throw VisualContractError.duplicateAction
        }
        switch (node.kind, action.kind) {
        case (.sourceComposition, .setField):
            guard action.values.count==2, let component=action.values["component"]?.string, let value=action.values["value"] else {throw VisualContractError.invalidAction}
            var document = try compositionDocument(nodeID:node.id)
            let path = try document.edit(componentID:component,value:A2UIValue(native:value))
            values[compositionPrefix(nodeID:node.id)+path] = value
        case (.sourceComposition, .submitForm):
            guard let button=action.values["$button"]?.string, action.values == (try compositionSubmissionValues(nodeID:node.id,buttonID:button)) else {throw VisualContractError.invalidAction}
        case (_, .displayed):
            guard requiresDisplayReceipt, node.id == surface.nodes.first?.id, action.values.isEmpty else { throw VisualContractError.invalidAction }
            values["$displayReceipt@" + String(surface.revision)] = .flag(true)
        case (.askApproval, .setField):
            guard action.values.count == 1, let note = action.values["note"]?.string, note.utf16.count <= 2000 else { throw VisualContractError.invalidAction }
            values[approvalNoteKey(nodeID: node.id)] = .text(note)
        case (.askForm, .setField):
            guard action.values.count == 1, let (key, value) = action.values.first,
                  let field = node.fields?.first(where: { $0.id == key }) else { throw VisualContractError.invalidAction }
            if node.formEvent != nil {
                guard field.acceptsSourceValue(value) else { throw VisualContractError.invalidAction }
                values[formFieldKey(node: node, fieldID: key)] = value
            } else {
                guard let raw = value.string, raw.utf16.count <= 2000 else { throw VisualContractError.invalidAction }
                if field.type == .select && !(field.options ?? []).contains(raw) && !raw.isEmpty { throw VisualContractError.invalidAction }
                values[formFieldKey(node: node, fieldID: key)] = .text(raw)
            }
        case (.askForm, .submitForm):
            guard let fields = node.fields else { throw VisualContractError.invalidAction }
            if node.formEvent != nil {
                guard action.values == (try proposedFormValues(nodeID: node.id)) else { throw VisualContractError.invalidAction }
                break
            }
            var typed: [String: VisualScalar] = [:]
            for field in fields {
                let raw = formFieldValue(nodeID: node.id, fieldID: field.id).trimmingCharacters(in: .whitespacesAndNewlines)
                if raw.isEmpty {
                    if field.required { throw VisualContractError.invalidAction }
                    continue
                }
                if raw.utf16.count > 2000 { throw VisualContractError.invalidAction }
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
                  (!action.values.keys.contains("note") || action.values["note"]?.string.map { $0.utf16.count <= 2000 } == true) else {
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
        surface.nodes.allSatisfy { !$0.requiresHumanAction } &&
            values["$displayReceipt@" + String(surface.revision)] != .flag(true)
    }
    private func compositionPrefix(nodeID:String) -> String { nodeID+".source@"+String(surface.revision)+":" }
    public func compositionDocument(nodeID:String) throws -> A2UIDocument {
        guard let node=surface.nodes.first(where:{$0.id==nodeID && $0.kind == .sourceComposition}), let document=node.composition else {throw VisualContractError.invalidNode}
        let prefix=compositionPrefix(nodeID:nodeID)
        var drafts:[String:A2UIValue]=[:]
        for (key,value) in values where key.hasPrefix(prefix) { drafts[String(key.dropFirst(prefix.count))]=A2UIValue(native:value) }
        return try A2UIDocument(surfaceId:document.surfaceId,catalogId:document.catalogId,revision:surface.revision,components:document.components,dataModel:document.dataModel,localEdits:drafts,version:document.version)
    }
    public func compositionSubmissionValues(nodeID:String,buttonID:String) throws -> [String:VisualScalar] {
        let document=try compositionDocument(nodeID:nodeID)
        let event=try document.makeEvent(buttonID:buttonID,timestamp:"1970-01-01T00:00:00Z",idempotencyKey:"projection")
        var output:[String:VisualScalar]=["$button":.text(buttonID)]
        for (key,value) in event.context { output["context:"+key]=try value.nativeScalar() }
        return output
    }
    private func approvalNoteKey(nodeID: String) -> String { nodeID + ".approvalNote@" + String(surface.revision) }
    public func approvalNote(nodeID: String) -> String {
        guard surface.nodes.contains(where: { $0.id == nodeID && $0.kind == .askApproval }) else { return "" }
        return values[approvalNoteKey(nodeID: nodeID)]?.string ?? ""
    }

    private func formFieldKey(node: VisualNode, fieldID: String) -> String {
        node.id + (node.formEvent == nil ? "." : ".a2ui@" + String(surface.revision) + ".") + fieldID
    }
    public func formFieldData(nodeID: String, fieldID: String) -> VisualScalar? {
        guard let node = surface.nodes.first(where: { $0.id == nodeID && $0.kind == .askForm }),
              let field = node.fields?.first(where: { $0.id == fieldID }) else { return nil }
        return values[formFieldKey(node: node, fieldID: fieldID)] ?? field.initialValue
    }
    public func formFieldValue(nodeID: String, fieldID: String) -> String { formFieldData(nodeID: nodeID, fieldID: fieldID)?.string ?? "" }

    public func formChoiceIsSelected(nodeID: String, fieldID: String, optionID: String) -> Bool {
        formFieldData(nodeID: nodeID, fieldID: fieldID)?.stringList?.contains(where: { visualWireStringEqual($0, optionID) }) == true
    }

    public func proposedChoiceValue(nodeID: String, fieldID: String, optionID: String) throws -> VisualScalar {
        guard let node = surface.nodes.first(where: { $0.id == nodeID && $0.formEvent != nil }),
              let field = node.fields?.first(where: { $0.id == fieldID && $0.type == .choice }),
              field.choices?.contains(where: { visualWireStringEqual($0.id, optionID) }) == true,
              let current = formFieldData(nodeID: nodeID, fieldID: fieldID), field.acceptsSourceValue(current), let selected = current.stringList else { throw VisualContractError.invalidAction }
        if field.allowsMultipleSelection == true {
            return .strings(selected.contains(where: { visualWireStringEqual($0, optionID) }) ? selected.filter { !visualWireStringEqual($0, optionID) } : selected + [optionID])
        }
        return .strings([optionID])
    }

    public func proposedFormValues(nodeID: String) throws -> [String: VisualScalar] {
        guard let node = surface.nodes.first(where: { $0.id == nodeID && $0.kind == .askForm }),
              let fields = node.fields else { throw VisualContractError.invalidAction }
        if node.formEvent != nil {
            var source: [String: VisualScalar] = [:]
            for field in fields {
                guard let value = formFieldData(nodeID: nodeID, fieldID: field.id), field.acceptsSourceValue(value) else { throw VisualContractError.invalidAction }
                source[field.id] = value
            }
            return source
        }
        var out: [String: VisualScalar] = [:]
        for field in fields {
            let raw = formFieldValue(nodeID: node.id, fieldID: field.id).trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { continue }
            if field.type == .number {
                guard let number = Double(raw), number.isFinite else { throw VisualContractError.invalidAction }
                out[field.id] = .number(number)
            } else { out[field.id] = .text(raw) }
        }
        return out
    }
}
