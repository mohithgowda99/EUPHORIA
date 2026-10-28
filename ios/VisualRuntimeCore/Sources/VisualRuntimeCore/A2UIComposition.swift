import Foundation

/// Bounded subset of pinned A2UI v0.9 data. This is a pure value projection, NOT a session,
/// tool executor, persistence provider, or replacement for EUPHORIA's VisualState / gateway journal.
public indirect enum A2UIValue: Codable, Equatable, Sendable {
    case string(String), number(Double), bool(Bool), array([A2UIValue]), object([String: A2UIValue]), null
    public static func == (lhs: A2UIValue, rhs: A2UIValue) -> Bool {
        switch (lhs, rhs) {
        case (.string(let a), .string(let b)): return visualWireStringEqual(a,b)
        case (.number(let a), .number(let b)): return a == b
        case (.bool(let a), .bool(let b)): return a == b
        case (.array(let a), .array(let b)): return a == b
        case (.object(let a), .object(let b)): return a == b
        case (.null,.null): return true
        default: return false
        }
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let n = try? c.decode(Double.self) { guard n.isFinite else { throw A2UIError.invalidData }; self = .number(n) }
        else if let a = try? c.decode([A2UIValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: A2UIValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): guard n.isFinite else { throw A2UIError.invalidData }; try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }
    public var text: String? { if case .string(let s) = self { return s }; return nil }
    public var boolean: Bool? { if case .bool(let b) = self { return b }; return nil }
    public var object: [String:A2UIValue]? { if case .object(let o) = self { return o }; return nil }
}

public enum A2UIError: Error, Equatable, Sendable {
    case unsupportedVersion, unsupportedComponent(String), invalidTree, invalidData, invalidPath,
         missingBinding, invalidAction, mismatchedSurface, staleRevision
}

public struct A2UIComponent: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let component: String
    public let properties: [String: A2UIValue]
    private struct Key: CodingKey { var stringValue: String; var intValue: Int? { nil }; init(stringValue: String) { self.stringValue = stringValue }; init?(intValue: Int) { return nil } }
    public init(id: String, component: String, properties: [String:A2UIValue]) {
        self.id = id; self.component = component; self.properties = properties
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        guard let id = try c.decodeIfPresent(String.self, forKey: Key(stringValue:"id")),
              let kind = try c.decodeIfPresent(String.self, forKey: Key(stringValue:"component")) else { throw A2UIError.invalidTree }
        self.id = id; self.component = kind
        var p: [String:A2UIValue] = [:]
        for k in c.allKeys where k.stringValue != "id" && k.stringValue != "component" { p[k.stringValue] = try c.decode(A2UIValue.self, forKey:k) }
        properties = p
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy:Key.self)
        try c.encode(id,forKey:Key(stringValue:"id")); try c.encode(component,forKey:Key(stringValue:"component"))
        for (k,v) in properties { try c.encode(v,forKey:Key(stringValue:k)) }
    }
}

/// A2UI operation projection plus unacknowledged local edits. The owner stores this value inside
/// the established SwiftData snapshot; no direct disk or network writes are performed here.
public struct A2UIDocument: Codable, Equatable, Sendable {
    public let version: String
    public let surfaceId: String
    public let catalogId: String
    public private(set) var revision: Int
    public private(set) var components: [A2UIComponent]
    public private(set) var dataModel: A2UIValue
    public private(set) var localEdits: [String:A2UIValue]

    public init(surfaceId: String, catalogId: String, revision: Int = 0, components: [A2UIComponent], dataModel: A2UIValue = .object([:]), localEdits: [String:A2UIValue] = [:], version: String = "v0.9") throws {
        self.version = version; self.surfaceId = surfaceId; self.catalogId = catalogId
        self.revision = revision; self.components = components; self.dataModel = dataModel; self.localEdits = localEdits
        try validate()
    }
    private enum CodingKeys: String, CodingKey {
        case version, surfaceId, catalogId, revision, components, dataModel, localEdits
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            surfaceId: c.decode(String.self, forKey: .surfaceId),
            catalogId: c.decode(String.self, forKey: .catalogId),
            revision: c.decode(Int.self, forKey: .revision),
            components: c.decode([A2UIComponent].self, forKey: .components),
            dataModel: c.decode(A2UIValue.self, forKey: .dataModel),
            localEdits: c.decodeIfPresent([String: A2UIValue].self, forKey: .localEdits) ?? [:],
            version: c.decode(String.self, forKey: .version)
        )
    }
    public func validate() throws {
        guard version == "v0.9" else { throw A2UIError.unsupportedVersion }
        guard !surfaceId.isEmpty && surfaceId.utf16.count <= 128,
              catalogId == "https://a2ui.org/specification/v0_9/basic_catalog.json",
              revision >= 0, components.count > 0 && components.count <= 200,
              dataModel.object != nil, localEdits.count <= 64 else { throw A2UIError.invalidData }
        let byID = Dictionary(components.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        guard byID.count == components.count, byID["root"] != nil else { throw A2UIError.invalidTree }
        var visited = Set<String>(), stack = Set<String>()
        func visit(_ id: String, depth: Int) throws {
            guard depth <= 24, let n = byID[id], !stack.contains(id) else { throw A2UIError.invalidTree }
            if visited.contains(id) { throw A2UIError.invalidTree }
            guard Self.safeKey(id) else { throw A2UIError.invalidTree }
            let allowed: Set<String> = ["Column", "Row", "Card", "Text", "Button", "TextField", "CheckBox", "ChoicePicker"]
            guard allowed.contains(n.component) else { throw A2UIError.unsupportedComponent(n.component) }
            let keys: Set<String>
            switch n.component {
            case "Column","Row": keys = ["children"] // unsupported alignment is rejected, not ignored
            case "Card": keys = ["child"]
            case "Button": keys = ["child","action","variant"]
            case "Text": keys = ["text","variant"]
            case "TextField": keys = ["label","value"]
            case "CheckBox": keys = ["label","value"]
            case "ChoicePicker": keys = ["label","options","value","variant"]
            default: throw A2UIError.invalidTree
            }
            guard Set(n.properties.keys).isSubset(of:keys) else { throw A2UIError.invalidTree }
            if n.properties["variant"] != nil && n.properties["variant"]?.text == nil { throw A2UIError.invalidTree }
            if let variant = n.properties["variant"]?.text {
                if n.component == "Text" && !["h1","h2","h3","h4","h5","caption","body"].contains(variant) { throw A2UIError.invalidTree }
                if n.component == "Button" && !["primary","borderless"].contains(variant) { throw A2UIError.invalidTree }
                if n.component == "ChoicePicker" && !["mutuallyExclusive","multipleSelection"].contains(variant) { throw A2UIError.invalidTree }
            }
            stack.insert(id)
            switch n.component {
            case "Column","Row":
                guard case .array(let children)? = n.properties["children"], children.count <= 40 else { throw A2UIError.invalidTree }
                for child in children { guard let name = child.text else { throw A2UIError.invalidTree }; try visit(name,depth:depth+1) }
            case "Card","Button":
                guard let child = n.properties["child"]?.text else { throw A2UIError.invalidTree }
                try visit(child,depth:depth+1)
                if n.component == "Button" { try validateAction(n.properties["action"]) }
            case "Text": try require(.string, n.properties["text"])
            case "TextField": try require(.string, n.properties["label"]); if let value = n.properties["value"] { try require(.string,value) }
            case "CheckBox": try require(.string,n.properties["label"]); try require(.bool,n.properties["value"])
            case "ChoicePicker":
                if let label = n.properties["label"] { try require(.string,label) }
                try require(.list,n.properties["value"])
                guard case .array(let options)? = n.properties["options"], !options.isEmpty, options.count <= 20 else { throw A2UIError.invalidTree }
                var values=Set<[UInt16]>()
                for option in options {
                    guard let obj=option.object, let value=obj["value"]?.text, let label=obj["label"] else { throw A2UIError.invalidTree }
                    try require(.string,label)
                    guard let resolvedLabel=try resolve(label).text,!resolvedLabel.isEmpty,resolvedLabel.utf16.count<=100 else {throw A2UIError.invalidData}
                    guard value.utf16.count<=2000 && values.insert(visualWireStringKey(value)).inserted && Set(obj.keys) == Set(["label","value"]) else { throw A2UIError.invalidTree }
                }
                guard Self.validChoices(try resolve(n.properties["value"]!),node:n) else {throw A2UIError.invalidData}
            default: break
            }
            stack.remove(id); visited.insert(id)
        }
        try visit("root",depth:0)
        guard visited.count == components.count else { throw A2UIError.invalidTree }
        // Every bound path used by this slice must resolve to the expected type.
        let editablePaths=Set(components.filter{["TextField","CheckBox","ChoicePicker"].contains($0.component)}.compactMap{$0.properties["value"]?.object?["path"]?.text})
        for (path,value) in localEdits {
            try Self.checkPath(path)
            guard editablePaths.contains(path), let original = try? Self.lookup(path, in:dataModel), Self.sameShape(original,value) else { throw A2UIError.invalidData }
        }
        var budget=4096
        try Self.validateValue(dataModel,depth:0,budget:&budget)
        for node in components { try Self.validateValue(.object(node.properties),depth:0,budget:&budget) }
        for value in localEdits.values { try Self.validateValue(value,depth:0,budget:&budget) }
    }
    private enum Expected { case string, bool, list }
    private func require(_ type:Expected,_ raw:A2UIValue?) throws {
        guard let raw else { throw A2UIError.invalidTree }
        let value=try resolve(raw)
        let valid: Bool
        switch(type,value) { case (.string,.string),(.bool,.bool): valid=true
        case (.list,.array(let a)): valid=a.count<=20 && a.allSatisfy({ $0.text != nil })
        default: valid=false }
        guard valid else { throw A2UIError.invalidData }
    }
    private func validateAction(_ raw:A2UIValue?) throws {
        guard let a=raw?.object, Set(a.keys)==Set(["event"]), let e=a["event"]?.object,
              let name=e["name"]?.text,Self.safeKey(name),
              Set(e.keys).isSubset(of:Set(["name","context"])) else { throw A2UIError.invalidAction }
        if let c=e["context"] {
            guard let pairs=c.object,pairs.count<=20 else { throw A2UIError.invalidAction }
            for (k,v) in pairs { guard Self.safeKey(k) else { throw A2UIError.invalidAction }; _=try resolve(v) }
        }
    }
    public func resolve(_ raw:A2UIValue) throws -> A2UIValue {
        if case .object(let props)=raw, Set(props.keys)==Set(["path"]), let path=props["path"]?.text {
            try Self.checkPath(path)
            if let draft=localEdits[path] { return draft }
            return try Self.lookup(path,in:dataModel)
        }
        // Explicit functionCall and ambiguous property objects are NOT evaluable.
        if case .object = raw { throw A2UIError.invalidData }
        return raw
    }
    public func value(id:String,property:String) throws -> A2UIValue {
        guard let node=components.first(where:{$0.id==id}),let raw=node.properties[property] else { throw A2UIError.invalidTree }
        return try resolve(raw)
    }
    /// Local model edit: no agent response or remote effect is claimed. Caller persists via existing snapshot.
    public mutating func edit(componentID:String, value:A2UIValue) throws -> String {
        guard let node=components.first(where:{$0.id==componentID}),
              ["TextField","CheckBox","ChoicePicker"].contains(node.component),
              let raw=node.properties["value"],case .object(let bind)=raw,
              Set(bind.keys)==Set(["path"]),let path=bind["path"]?.text else { throw A2UIError.invalidAction }
        try Self.checkPath(path)
        let old=try valueForBoundPath(path)
        guard Self.sameShape(old,value), (node.component != "ChoicePicker" || Self.validChoices(value,node:node)) else { throw A2UIError.invalidData }
        var proposed=self; proposed.localEdits[path]=value
        try proposed.validate()
        self=proposed
        return path
    }
    private func valueForBoundPath(_ path:String) throws -> A2UIValue { try Self.lookup(path,in:dataModel) }
    private static func validChoices(_ value:A2UIValue,node:A2UIComponent) -> Bool {
        guard case .array(let selected)=value, case .array(let options)?=node.properties["options"] else {return false}
        let allowed=Set(options.compactMap { $0.object?["value"]?.text }.map(visualWireStringKey))
        let picked=selected.compactMap(\.text)
        return picked.count==selected.count && Set(picked.map(visualWireStringKey)).count==picked.count && picked.allSatisfy({allowed.contains(visualWireStringKey($0))}) &&
               (node.properties["variant"]?.text != "mutuallyExclusive" || picked.count<=1)
    }
    private static func sameShape(_ a:A2UIValue,_ b:A2UIValue)->Bool {
        switch(a,b) { case (.string(let x),.string(let y)):return x.utf16.count<=2000 && y.utf16.count<=2000
        case (.bool,.bool):return true
        case (.number,.number):return true
        case (.array(let a),.array(let b)):return b.count<=20 && a.allSatisfy({$0.text != nil}) && b.allSatisfy({$0.text.map{$0.utf16.count<=2000}==true})
        default:return false }
    }
    public func makeEvent(buttonID:String, timestamp:String, idempotencyKey:String) throws -> A2UIActionIntent {
        guard let node=components.first(where:{$0.id==buttonID}),node.component=="Button",
              let action=node.properties["action"]?.object,let event=action["event"]?.object,
              let name=event["name"]?.text else { throw A2UIError.invalidAction }
        let contexts=event["context"]?.object ?? [:]
        var resolved:[String:A2UIValue]=[:]
        for (k,v) in contexts { resolved[k]=try resolve(v) }
        guard !idempotencyKey.isEmpty && idempotencyKey.count<=128 && !timestamp.isEmpty else { throw A2UIError.invalidAction }
        return A2UIActionIntent(id:idempotencyKey,name:name,surfaceId:surfaceId,sourceComponentId:buttonID,timestamp:timestamp,expectedRevision:revision,context:resolved)
    }
    /// Replace a complete normalized graph; this is not a parser for incremental source protocol messages.
    public mutating func updateComponents(_ replacement:[A2UIComponent],revision newRevision:Int) throws {
        guard newRevision>revision else { throw A2UIError.staleRevision }
        var proposed=self; proposed.components=replacement; proposed.revision=newRevision
        // Drop drafts for bindings that no longer exist or have changed type.
        let bindings=Set(replacement.compactMap({ node -> String? in node.properties["value"]?.object?["path"]?.text }))
        proposed.localEdits=localEdits.filter({ bindings.contains($0.key) })
        try proposed.validate();self=proposed
    }
    /// Data-model updates replace the target subtree. Draft edits at other paths survive.
    public mutating func updateDataModel(path:String="/",value:A2UIValue?,revision newRevision:Int) throws {
        guard newRevision>revision else { throw A2UIError.staleRevision }
        var proposed=self
        proposed.dataModel=try Self.replace(path:path,with:value,in:dataModel)
        proposed.revision=newRevision
        proposed.localEdits=localEdits.filter({ key, v in
            guard let original=try? Self.lookup(key,in:proposed.dataModel) else {return false}
            return Self.sameShape(original,v)
        })
        try proposed.validate();self=proposed
    }
    /// Gateway-side accepted revision; do not discard unacknowledged edits on stream disconnect.
    public mutating func acknowledge(paths:[String],revision newRevision:Int,authoritativeModel:A2UIValue) throws {
        guard newRevision>revision else {throw A2UIError.staleRevision}
        var proposed=self;proposed.revision=newRevision;proposed.dataModel=authoritativeModel
        for path in paths { proposed.localEdits.removeValue(forKey:path) }
        try proposed.validate();self=proposed
    }
    public static func lookup(_ path:String,in model:A2UIValue) throws -> A2UIValue {
        let keys=try pathParts(path)
        var cursor=model
        for key in keys { guard let next=cursor.object?[key] else { throw A2UIError.missingBinding };cursor=next }
        return cursor
    }
    private static func checkPath(_ path:String) throws { _=try pathParts(path) }
    private static func pathParts(_ path:String) throws -> [String] {
        guard path.hasPrefix("/"), path != "/", path.utf16.count<=256 else {throw A2UIError.invalidPath}
        let parts=path.dropFirst().split(separator:"/",omittingEmptySubsequences:false).map(String.init)
        guard parts.count<=8 && parts.allSatisfy({ $0.range(of:"^[A-Za-z_][A-Za-z0-9_-]{0,63}$",options:.regularExpression) != nil && !["__proto__","constructor","prototype"].contains($0) }) else {throw A2UIError.invalidPath}
        return parts
    }
    private static func replace(path:String,with value:A2UIValue?,in model:A2UIValue) throws -> A2UIValue {
        if path=="/" { guard let value, value.object != nil else {throw A2UIError.invalidData};return value }
        let parts=try pathParts(path)
        func set(_ node:A2UIValue, i:Int) throws -> A2UIValue {
            guard case .object(var values)=node else {throw A2UIError.invalidPath}
            let key=parts[i]
            if i==parts.count-1 {values[key]=value} else {values[key]=try set(values[key] ?? .object([:]),i:i+1)}
            return .object(values)
        }
        return try set(model,i:0)
    }
    private static func safeKey(_ key: String) -> Bool {
        key.range(of:"^[A-Za-z_][A-Za-z0-9_-]{0,63}$",options:.regularExpression) != nil && !["__proto__","constructor","prototype"].contains(key)
    }
    private static func validateValue(_ data:A2UIValue,depth:Int,budget:inout Int) throws {
        budget -= 1
        guard budget>=0, depth<=12 else {throw A2UIError.invalidData}
        switch data {
        case .object(let obj): guard obj.count<=80 else {throw A2UIError.invalidData};for (k,v) in obj {guard safeKey(k) else {throw A2UIError.invalidData};try validateValue(v,depth:depth+1,budget:&budget)}
        case .array(let a):guard a.count<=80 else {throw A2UIError.invalidData};for v in a {try validateValue(v,depth:depth+1,budget:&budget)}
        case .string(let s):guard s.utf16.count<=2000 else {throw A2UIError.invalidData}
        case .number(let n):guard n.isFinite else {throw A2UIError.invalidData}
        case .bool,.null:break
        }
    }
}

/// Contract-shaped action to be **journaled/authorized by existing gateway**, never executed here.
public struct A2UIActionIntent: Codable, Equatable, Sendable {
    public let id:String
    public let name:String
    public let surfaceId:String
    public let sourceComponentId:String
    public let timestamp:String
    public let expectedRevision:Int
    public let context:[String:A2UIValue]
}
