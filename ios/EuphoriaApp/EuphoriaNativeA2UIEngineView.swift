import SwiftUI
import A2UISwiftCore
import A2UISwiftUI

/// Pinned community A2UI Swift renderer for source-validated compositions.
/// Edits persist through VisualNodesView's canonical state adapter; button IDs
/// resolve against that state before submission. Original source authorization
/// remains authoritative. Never send a raw engine action as an approval.
@MainActor
struct EuphoriaNativeA2UIEngineView: View {
    let document: A2UIDocument
    var onEdit: ((String, A2UIValue) -> Void)? = nil
    var onSubmit: ((String) -> Void)? = nil
    @State private var subscriptions: [DataSubscription<AnyCodable>] = []
    @State private var model = SurfaceViewModel(catalog: basicCatalog)
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.red)
            } else {
                A2UISurfaceView(viewModel: model, scrolls: false) { action in
                    Task { @MainActor in
                        if let onSubmit {
                            onSubmit(action.sourceComponentId)
                        } else {
                            error = "This interface attempted an action without an EUPHORIA authorization binding."
                        }
                    }
                }
            }
        }
        // Stable keyed identity is managed by A2UI-Swift. Reconstruct from
        // the saved source document, not stale engine-only memory.
        .task(id: revision) {
            do {
                let messages = try A2UIProjectionBridge.messages(from: document)
                let errors = model.processMessages(messages)
                if !errors.isEmpty { throw errors[0] }
                for subscription in subscriptions { subscription.unsubscribe() }
                subscriptions.removeAll()
                if let onEdit {
                    let context = model.makeDataContext()
                    for component in document.components {
                        guard ["TextField", "CheckBox", "ChoicePicker", "Slider", "DateTimeInput"].contains(component.component),
                              let path = component.properties["value"]?.object?["path"]?.text else { continue }
                        let componentID = component.id
                        let subscription = context.subscribeDynamicValue(.dataBinding(path: path)) { value in
                            guard let value,
                                  let bytes = try? JSONEncoder().encode(value),
                                  let converted = try? JSONDecoder().decode(A2UIValue.self, from: bytes)
                            else { return }
                            Task { @MainActor in onEdit(componentID, converted) }
                        }
                        subscriptions.append(subscription)
                    }
                }
                error = nil
            } catch {
                self.error = "The A2UI surface could not be validated. No action was submitted."
            }
        }
        .onDisappear {
            for subscription in subscriptions { subscription.unsubscribe() }
            subscriptions.removeAll()
        }
    }

    private var revision: String {
        // Source data / component changes need a new projection. This
        // deterministic fingerprint is strictly a rendering invalidation key,
        // never an idempotency key or provider correlation.
        // Source revision changes reflect authoritative server updates.
        // Local edits do not replace the engine or reset a text cursor.
        return document.surfaceId + ":" + String(document.revision)
    }
}
