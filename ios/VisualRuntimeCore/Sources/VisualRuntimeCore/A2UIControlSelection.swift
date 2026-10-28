import Foundation

/// Pure selection resolution for transient native A2UI controls.
///
/// Selections are scoped by the hosting composition view's surface and the
/// component ID. The protocol model, action journal, and persisted SwiftData
/// document are never modified when a tab changes.
public enum A2UIControlSelection {
    public static func resolvedChild(selected: String?, available: [String]) -> String? {
        guard let fallback = available.first else { return nil }
        guard let selected, available.contains(selected) else { return fallback }
        return selected
    }
}
