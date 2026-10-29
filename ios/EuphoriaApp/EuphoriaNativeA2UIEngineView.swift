import SwiftUI
import A2UISwiftCore
import A2UISwiftUI

/// Pinned community A2UI Swift renderer, only for source-validated display
/// compositions. EUPHORIA's original server/SwiftData remain authoritative.
/// A live interactive surface still uses VisualNodesView's persisted action
/// adapter until native engine event values can be verified against the source
/// continuation contract. Never send a raw engine action as an approval.
@MainActor
struct EuphoriaNativeA2UIEngineView: View {
    let document: A2UIDocument
    @State private var model = SurfaceViewModel(catalog: basicCatalog)
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.red)
            } else {
                A2UISurfaceView(viewModel: model) { _ in
                    error = "This interface attempted an action without an EUPHORIA authorization binding."
                }
            }
        }
        // Stable keyed identity is managed by A2UI-Swift. Reconstruct from
        // the saved source document, not stale engine-only memory.
        .task(id: revision) {
            do {
                let messages = try A2UIProjectionBridge.messages(from: document)
                try model.processMessages(messages)
                error = nil
            } catch {
                error = "The A2UI surface could not be validated. No action was submitted."
            }
        }
    }

    private var revision: String {
        // Source data / component changes need a new projection. This
        // deterministic fingerprint is strictly a rendering invalidation key,
        // never an idempotency key or provider correlation.
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let bytes = (try? encoder.encode(document)) ?? Data()
        return document.surfaceId + ":" + bytes.base64EncodedString()
    }
}
