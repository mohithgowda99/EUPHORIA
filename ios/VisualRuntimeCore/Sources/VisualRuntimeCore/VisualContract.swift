import Foundation

/// EUPHORIA native visual contract v1. No executable markup, scripts, URLs or credentials.
public enum VisualKind: String, Codable, Sendable {
    case askChoice, askForm, askApproval, showChecklist, pageChecklist
}

public enum VisualFieldKind: String, Codable, Sendable {
    case text, email, number, select, textarea
}

public enum VisualScalar: Codable, Equatable, Sendable {
    case text(String)
    case number(Double)
    case flag(Bool)

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) { self = .flag(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else { self = .text(try c.decode(String.self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .text(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .flag(let x): try c.encode(x)
        }
    }
    public var string: String? { if case .text(let s) = self { return s }; return nil }
    public var bool: Bool? { if case .flag(let b) = self { return b }; return nil }
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
    public init(id: String, label: String, type: VisualFieldKind, required: Bool = false,
                options: [String]? = nil, min: Double? = nil, max: Double? = nil) {
        self.id = id; self.label = label; self.type = type; self.required = required
        self.options = options; self.min = min; self.max = max
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

public struct VisualNode: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let kind: VisualKind
    public let title: String
    public let summary: String?
    public let options: [VisualOption]?
    public let fields: [VisualField]?
    public let items: [VisualChecklistItem]?
    public init(id: String, kind: VisualKind, title: String, summary: String? = nil,
                options: [VisualOption]? = nil, fields: [VisualField]? = nil,
                items: [VisualChecklistItem]? = nil) {
        self.id = id; self.kind = kind; self.title = title; self.summary = summary
        self.options = options; self.fields = fields; self.items = items
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
        guard schemaVersion == 1 else { throw VisualContractError.unsupportedVersion }
        guard !surfaceID.isEmpty, surfaceID.count <= 128, revision >= 0,
              !nodes.isEmpty, nodes.count <= 32 else { throw VisualContractError.invalidSurface }
        var nodeIDs = Set<String>()
        for node in nodes {
            guard !node.id.isEmpty, node.id.count <= 64, nodeIDs.insert(node.id).inserted,
                  !node.title.isEmpty, node.title.count <= 120 else { throw VisualContractError.invalidNode }
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
                          !f.label.isEmpty, f.label.count <= 100,
                          f.min == nil || f.max == nil || f.min! <= f.max! else {
                        throw VisualContractError.invalidNode
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
            case .askApproval: break
            }
        }
    }
}

public enum VisualActionKind: String, Codable, Sendable {
    case setField, submitForm, choose, decide, toggle
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
