import Foundation

/// Versioned native data contract; only explicit isolated artifact nodes carry executable web content.
public enum VisualKind: String, Codable, Sendable {
    case askChoice, askForm, askApproval, showChecklist, pageChecklist, gallery, htmlArtifact
}

public enum VisualFieldKind: String, Codable, Sendable {
    case text, email, number, select, textarea, checkbox, choice
}

public enum VisualScalar: Codable, Equatable, Sendable {
    case text(String)
    case number(Double)
    case flag(Bool)
    case strings([String])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) { self = .flag(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let list = try? c.decode([String].self) {
            guard list.count <= 20, Set(list).count == list.count, list.allSatisfy({ $0.utf16.count <= 2000 }) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid bounded string list")
            }
            self = .strings(list)
        } else { self = .text(try c.decode(String.self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .text(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .flag(let x): try c.encode(x)
        case .strings(let x):
            guard x.count <= 20, Set(x).count == x.count, x.allSatisfy({ $0.utf16.count <= 2000 }) else {
                throw EncodingError.invalidValue(x, .init(codingPath: encoder.codingPath, debugDescription: "Invalid bounded string list"))
            }
            try c.encode(x)
        }
    }
    public var string: String? { if case .text(let s) = self { return s }; return nil }
    public var bool: Bool? { if case .flag(let b) = self { return b }; return nil }
    public var stringList: [String]? { if case .strings(let list) = self { return list }; return nil }
}

public struct VisualOption: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let description: String?
    public init(id: String, label: String, description: String? = nil) {
        self.id = id; self.label = label; self.description = description
    }
}

public struct VisualField: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let type: VisualFieldKind
    public let required: Bool
    public let options: [String]?
    public let min: Double?
    public let max: Double?
    public let initialValue: VisualScalar?
    public let choices: [VisualOption]?
    public let allowsMultipleSelection: Bool?
    public init(id: String, label: String, type: VisualFieldKind, required: Bool = false,
                options: [String]? = nil, min: Double? = nil, max: Double? = nil, initialValue: VisualScalar? = nil, choices: [VisualOption]? = nil, allowsMultipleSelection: Bool? = nil) {
        self.id = id; self.label = label; self.type = type; self.required = required
        self.options = options; self.min = min; self.max = max; self.initialValue = initialValue
        self.choices = choices; self.allowsMultipleSelection = allowsMultipleSelection
    }
    func acceptsSourceValue(_ value: VisualScalar) -> Bool {
        switch (type, value) {
        case (.text, .text(let text)), (.textarea, .text(let text)): return text.utf16.count <= 2000
        case (.checkbox, .flag): return true
        case (.choice, .strings(let list)):
            return list.count <= 20 && Set(list).count == list.count && (allowsMultipleSelection == true || list.count <= 1) &&
                list.allSatisfy { value in value.utf16.count <= 2000 && choices?.contains(where: { $0.id == value }) == true }
        default: return false
        }
    }
    func validSourceField() -> Bool {
        guard !required, options == nil, min == nil, max == nil, let initialValue else { return false }
        if type == .choice {
            guard let choices, choices.count <= 20, allowsMultipleSelection != nil,
                  Set(choices.map(\.id)).count == choices.count,
                  choices.allSatisfy({ $0.id.utf16.count <= 2000 && !$0.label.isEmpty && $0.label.utf16.count <= 100 && $0.description == nil }) else { return false }
        } else if choices != nil || allowsMultipleSelection != nil { return false }
        return acceptsSourceValue(initialValue)
    }

}

public struct VisualChecklistItem: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let done: Bool
    public let note: String?
    public init(id: String, text: String, done: Bool, note: String? = nil) {
        self.id = id; self.text = text; self.done = done; self.note = note
    }
}

/// Source event metadata is data only. The gateway resolves it; it grants no native execution authority.
public struct VisualFormEvent: Codable, Equatable, Sendable {
    public let name: String
    public let surfaceID: String
    public let sourceComponentID: String
    public let contextFields: [String: String]
    public let literalContext: [String: VisualScalar]
    func validate(fields: [VisualField]) throws {
        func safe(_ key: String) -> Bool {
            key.range(of: "^[A-Za-z_][A-Za-z0-9_-]{0,63}$", options: .regularExpression) != nil &&
                !["__proto__", "prototype", "constructor"].contains(key)
        }
        guard [name, surfaceID, sourceComponentID].allSatisfy(safe), contextFields.count <= 20, literalContext.count <= 20,
              contextFields.keys.allSatisfy(safe), literalContext.keys.allSatisfy(safe),
              Set(contextFields.keys).isDisjoint(with: literalContext.keys),
              contextFields.values.allSatisfy({ id in fields.contains { $0.id == id } }),
              fields.allSatisfy({ $0.validSourceField() }),
              literalContext.values.allSatisfy({ value in
                  switch value { case .text(let s): return s.utf16.count <= 2000; case .number(let n): return n.isFinite; case .flag: return true; case .strings: return false }
              }) else { throw VisualContractError.invalidNode }
    }
}

public struct VisualNode: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let kind: VisualKind
    public let title: String
    public let summary: String?
    public let options: [VisualOption]?
    public let fields: [VisualField]?
    public let items: [VisualChecklistItem]?
    public let gallery: VisualGallery?
    public let html: String?
    public let submitLabel: String?
    public let formEvent: VisualFormEvent?
    public init(id: String, kind: VisualKind, title: String, summary: String? = nil,
                options: [VisualOption]? = nil, fields: [VisualField]? = nil,
                items: [VisualChecklistItem]? = nil, gallery: VisualGallery? = nil, html: String? = nil, submitLabel: String? = nil, formEvent: VisualFormEvent? = nil) {
        self.id = id; self.kind = kind; self.title = title; self.summary = summary
        self.options = options; self.fields = fields; self.items = items; self.gallery = gallery; self.html = html; self.submitLabel = submitLabel; self.formEvent = formEvent
    }
}

public enum VisualContractError: Error, Equatable {
    case unsupportedVersion, invalidSurface, invalidNode, invalidAction, staleRevision, duplicateAction
}

public struct VisualSurface: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let surfaceID: String
    public let revision: Int
    public let nodes: [VisualNode]
    public init(surfaceID: String, revision: Int, nodes: [VisualNode], schemaVersion: Int = 1) throws {
        self.schemaVersion = schemaVersion; self.surfaceID = surfaceID
        self.revision = revision; self.nodes = nodes
        try validate()
    }
    private enum CodingKeys: String, CodingKey { case schemaVersion, surfaceID, revision, nodes }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(surfaceID: c.decode(String.self, forKey: .surfaceID),
            revision: c.decode(Int.self, forKey: .revision), nodes: c.decode([VisualNode].self, forKey: .nodes),
            schemaVersion: c.decode(Int.self, forKey: .schemaVersion))
    }
    public func validate() throws {
        guard [1,2].contains(schemaVersion) else { throw VisualContractError.unsupportedVersion }
        guard !surfaceID.isEmpty, surfaceID.count <= 128, revision >= 0,
              !nodes.isEmpty, nodes.count <= 32 else { throw VisualContractError.invalidSurface }
        var nodeIDs = Set<String>()
        for node in nodes {
            guard !node.id.isEmpty, node.id.count <= 64, nodeIDs.insert(node.id).inserted,
                  !node.title.isEmpty, node.title.count <= 120 else { throw VisualContractError.invalidNode }
            if let label = node.submitLabel {
                guard node.kind == .askForm, !label.isEmpty, label.count <= 100 else { throw VisualContractError.invalidNode }
            }
            if let event = node.formEvent {
                guard schemaVersion == 2, node.kind == .askForm, node.submitLabel != nil else { throw VisualContractError.invalidNode }
                try event.validate(fields: node.fields ?? [])
            }
            switch node.kind {
            case .askChoice:
                let options = node.options ?? []
                guard (1...20).contains(options.count),
                      Set(options.map(\.id)).count == options.count,
                      options.allSatisfy({ !$0.id.isEmpty && !$0.label.isEmpty }) else { throw VisualContractError.invalidNode }
            case .askForm:
                let fields = node.fields ?? []
                guard (1...8).contains(fields.count), Set(fields.map(\.id)).count == fields.count else {
                    throw VisualContractError.invalidNode
                }
                for f in fields {
                    guard f.id.range(of: "^[A-Za-z][A-Za-z0-9_]{0,47}$", options: .regularExpression) != nil,
                          (f.type == .choice || !f.label.isEmpty), f.label.utf16.count <= 100,
                          f.min == nil || f.max == nil || f.min! <= f.max! else {
                        throw VisualContractError.invalidNode
                    }
                    if node.formEvent == nil {
                        guard ![.checkbox, .choice].contains(f.type), f.choices == nil, f.allowsMultipleSelection == nil,
                              f.initialValue == nil || (f.initialValue?.string.map { $0.utf16.count <= 2000 } == true) else { throw VisualContractError.invalidNode }
                    }
                    if f.type == .select {
                        let opts = f.options ?? []
                        guard (1...20).contains(opts.count), Set(opts).count == opts.count else {
                            throw VisualContractError.invalidNode
                        }
                    }
                }
            case .pageChecklist, .showChecklist:
                let items = node.items ?? []
                guard items.count <= 50, Set(items.map(\.id)).count == items.count,
                      items.allSatisfy({ !$0.id.isEmpty && !$0.text.isEmpty }) else {
                    throw VisualContractError.invalidNode
                }
            case .gallery:
                guard schemaVersion == 2, let gallery = node.gallery else { throw VisualContractError.invalidNode }
                try gallery.validate()
            case .htmlArtifact:
                guard schemaVersion == 2, let html = node.html, !html.isEmpty, html.count <= 64000, html.utf8.count <= 128000 else { throw VisualContractError.invalidNode }
            case .askApproval: break
            }
        }
    }
}

public enum VisualActionKind: String, Codable, Sendable {
    case setField, submitForm, choose, decide, toggle, displayed
}

/// Revision is the last *server acknowledged* surface revision, never an optimistic guess.
public struct VisualAction: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let surfaceID: String
    public let expectedRevision: Int
    public let nodeID: String
    public let kind: VisualActionKind
    public let values: [String: VisualScalar]
    public init(id: String, surfaceID: String, expectedRevision: Int, nodeID: String,
                kind: VisualActionKind, values: [String: VisualScalar]) {
        self.id = id; self.surfaceID = surfaceID; self.expectedRevision = expectedRevision
        self.nodeID = nodeID; self.kind = kind; self.values = values
    }
}
