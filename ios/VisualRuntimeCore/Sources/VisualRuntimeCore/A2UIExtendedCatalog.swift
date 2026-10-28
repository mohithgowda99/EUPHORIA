import Foundation

/// Additional pinned A2UI v0.9 basic catalog rules. This extends A2UIDocument's existing
/// validation and state; it does not own a second document, action queue or persistence layer.
/// Dynamically repeated template children are deliberately rejected until scoped bindings
/// and stable repeated identities are implemented in the canonical document.
public enum A2UIExtendedCatalog {
    public static let kinds: Set<String> = [
        "Image", "Icon", "Video", "AudioPlayer", "List", "Tabs", "Modal",
        "Divider", "Slider", "DateTimeInput"
    ]

    public static func properties(for kind: String) -> Set<String>? {
        switch kind {
        case "Image": return ["url", "description", "fit", "variant"]
        case "Icon": return ["name"]
        case "Video": return ["url"]
        case "AudioPlayer": return ["url", "description"]
        case "List": return ["children", "direction", "align"]
        case "Tabs": return ["tabs"]
        case "Modal": return ["trigger", "content"]
        case "Divider": return ["axis"]
        case "Slider": return ["label", "value", "min", "max"]
        case "DateTimeInput": return ["value", "label", "min", "max", "enableDate", "enableTime"]
        default: return nil
        }
    }

    /// Validates source properties and returns statically referenced children. Parent validates
    /// unique tree ownership, cycles and stable IDs using its original visitor.
    public static func validate(_ node: A2UIComponent, in document: A2UIDocument) throws -> [String] {
        guard let keys = properties(for: node.component),
              Set(node.properties.keys).isSubset(of: keys) else { throw A2UIError.invalidTree }
        func resolved(_ key: String) throws -> A2UIValue {
            guard let raw = node.properties[key] else { throw A2UIError.invalidTree }
            return try document.resolve(raw)
        }
        func string(_ key: String) throws -> String {
            guard let s = try resolved(key).text, s.utf16.count <= 2000 else { throw A2UIError.invalidData }
            return s
        }
        func enumValue(_ key: String, _ cases: Set<String>) throws {
            if node.properties[key] != nil { let value = try string(key); guard cases.contains(value) else { throw A2UIError.invalidTree } }
        }
        switch node.component {
        case "Image":
            try secureURL(string("url"))
            if node.properties["description"] != nil { _ = try string("description") }
            try enumValue("fit", ["contain", "cover", "fill", "none", "scaleDown"])
            try enumValue("variant", ["icon", "avatar", "smallFeature", "mediumFeature", "largeFeature", "header"])
        case "Icon":
            // The source catalog also permits svgPath and dynamic names. Those variants are
            // intentionally NOT accepted: no unreviewed SVG parser or arbitrary native symbols.
            guard icons.contains(try string("name")) else { throw A2UIError.invalidData }
        case "Video", "AudioPlayer":
            try secureURL(string("url"))
            if node.properties["description"] != nil { _ = try string("description") }
        case "List":
            try enumValue("direction", ["vertical", "horizontal"])
            try enumValue("align", ["start", "center", "end", "stretch"])
            guard case .array(let children)? = node.properties["children"], children.count <= 40,
                  children.allSatisfy({ $0.text != nil }) else {
                // A2UI v0.9 also supports {componentId,path} dynamic templates, but
                // accepting those without item-local binding scope would corrupt state.
                throw A2UIError.invalidTree
            }
            return children.compactMap(\.text)
        case "Tabs":
            guard case .array(let tabs)? = node.properties["tabs"], (1...12).contains(tabs.count) else { throw A2UIError.invalidTree }
            var children: [String] = []
            for tab in tabs {
                guard let entry = tab.object, Set(entry.keys) == ["title", "child"],
                      let child = entry["child"]?.text,
                      let title = entry["title"],
                      let name = try document.resolve(title).text,
                      !name.isEmpty && name.utf16.count <= 100 else { throw A2UIError.invalidTree }
                children.append(child)
            }
            return children
        case "Modal":
            guard let trigger = node.properties["trigger"]?.text,
                  let content = node.properties["content"]?.text,
                  trigger != content else { throw A2UIError.invalidTree }
            return [trigger, content]
        case "Divider":
            try enumValue("axis", ["horizontal", "vertical"])
        case "Slider":
            let max = try numeric(node.properties["max"])
            let min = try node.properties["min"].map { try numeric($0) } ?? 0
            guard min < max, let value = try? numeric(resolved("value")), value >= min, value <= max else { throw A2UIError.invalidData }
            if node.properties["label"] != nil { _ = try string("label") }
        case "DateTimeInput":
            let date = node.properties["enableDate"]?.boolean ?? false
            let time = node.properties["enableTime"]?.boolean ?? false
            guard date || time,
                  node.properties["enableDate"] == nil || node.properties["enableDate"]?.boolean != nil,
                  node.properties["enableTime"] == nil || node.properties["enableTime"]?.boolean != nil else { throw A2UIError.invalidTree }
            let value = try string("value")
            guard validDate(value, date: date, time: time) else { throw A2UIError.invalidData }
            for key in ["min", "max"] where node.properties[key] != nil {
                guard validDate(try string(key), date: date, time: time) else { throw A2UIError.invalidData }
            }
            if node.properties["label"] != nil { _ = try string("label") }
        default: throw A2UIError.unsupportedComponent(node.component)
        }
        return []
    }

    public static func validateEdit(_ value: A2UIValue, node: A2UIComponent) throws {
        switch node.component {
        case "Slider":
            let n = try numeric(value)
            let min = try node.properties["min"].map { try numeric($0) } ?? 0
            let max = try numeric(node.properties["max"])
            guard n >= min, n <= max else { throw A2UIError.invalidData }
        case "DateTimeInput":
            guard let s = value.text,
                  validDate(s, date: node.properties["enableDate"]?.boolean ?? false,
                            time: node.properties["enableTime"]?.boolean ?? false) else { throw A2UIError.invalidData }
        default: break
        }
    }

    private static func numeric(_ value: A2UIValue?) throws -> Double {
        guard case .number(let n)? = value, n.isFinite else { throw A2UIError.invalidData }
        return n
    }
    private static func secureURL(_ value: String) throws {
        guard let u = URLComponents(string: value), u.scheme?.lowercased() == "https",
              let host = u.host?.lowercased(), !host.isEmpty, u.url != nil,
              u.user == nil, u.password == nil, u.fragment == nil,
              (u.port == nil || u.port == 443), value.utf16.count <= 2000 else {
            throw A2UIError.invalidData
        }
        // Offline validation only. Agent A must gate media URLs against DNS rebinding
        // and remote redirects before full production media admission.
        guard host != "localhost", !host.hasSuffix(".localhost"),
              !host.hasSuffix(".local"), !host.hasSuffix(".internal"),
              !host.contains(":"), !host.hasSuffix(".onion"),
              !host.split(separator: ".").allSatisfy({ Int($0) != nil }) else {
            throw A2UIError.invalidData
        }
    }
    private static func validDate(_ value: String, date: Bool, time: Bool) -> Bool {
        if value.isEmpty { return true } // Pinned source allows uninitialized bound values.
        if date && time { return ISO8601DateFormatter().date(from: value) != nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.isLenient = false
        if date {
            f.dateFormat = "yyyy-MM-dd"
            return f.date(from: value).map { f.string(from: $0) == value } ?? false
        }
        if time {
            f.dateFormat = value.utf16.count == 5 ? "HH:mm" : "HH:mm:ss"
            return f.date(from: value).map { f.string(from: $0) == value } ?? false
        }
        return false
    }
    private static let icons: Set<String> = [
        "accountCircle", "add", "arrowBack", "arrowForward", "attachFile", "calendarToday",
        "call", "camera", "check", "close", "delete", "download", "edit", "event", "error",
        "fastForward", "favorite", "favoriteOff", "folder", "help", "home", "info",
        "locationOn", "lock", "lockOpen", "mail", "menu", "moreVert", "moreHoriz",
        "notificationsOff", "notifications", "pause", "payment", "person", "phone",
        "photo", "play", "print", "refresh", "rewind", "search", "send", "settings",
        "share", "shoppingCart", "skipNext", "skipPrevious", "star", "starHalf",
        "starOff", "stop", "upload", "visibility", "visibilityOff", "volumeDown",
        "volumeMute", "volumeOff", "volumeUp", "warning"
    ]
}
