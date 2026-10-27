import SwiftUI
import SwiftData

/// Native-only source fixture viewer. No simulated model, server, or approval execution.
struct VisualFixtureView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var state: VisualState?
    @State private var errorMessage: String?
    @State private var approvalNote = ""

    var body: some View {
        List {
            Section {
                Text("OpenDuet-derived native interaction fixtures. No agent connected.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if let state {
                    Text("Surface revision \(state.surface.revision) · \(state.pending.count) unsynchronized action(s)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.caption)
                }
            }
            if let state {
                ForEach(state.surface.nodes) { node in
                    section(for: node)
                }
            } else {
                ProgressView("Loading local fixture")
            }
        }
        .navigationTitle("Visual runtime fixtures")
        .task { loadSnapshot() }
    }

    @ViewBuilder private func section(for node: VisualNode) -> some View {
        Section(node.title) {
            if let summary = node.summary { Text(summary).font(.subheadline).foregroundStyle(.secondary) }
            switch node.kind {
            case .askChoice:
                ForEach(node.options ?? []) { option in
                    Button {
                        enact(node, kind: .choose,
                              values: ["choice": .text(option.id), "label": .text(option.label)])
                    } label: {
                        VStack(alignment: .leading) {
                            Text(option.label)
                            if let detail = option.description {
                                Text(detail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .disabled(isWaiting(node, kind: .choose))
                }
            case .askForm:
                ForEach(node.fields ?? []) { field in
                    fieldView(field, node: node)
                }
                Button("Submit form (local pending)") {
                    guard let state else { return }
                    do {
                        enact(node, kind: .submitForm,
                              values: try state.proposedFormValues(nodeID: node.id))
                    } catch { errorMessage = "Form validation: \(error.localizedDescription)" }
                }
                .disabled(isWaiting(node, kind: .submitForm))
            case .askApproval:
                TextField("Optional decision note", text: $approvalNote, axis: .vertical)
                HStack {
                    Button("Approve (fixture)") { decision("approved", node: node) }
                    Spacer()
                    Button("Decline (fixture)") { decision("declined", node: node) }
                }
                .disabled(isWaiting(node, kind: .decide))
                Text("This queues a response. It cannot authorize a real-world effect.")
                    .font(.caption).foregroundStyle(.secondary)
            case .showChecklist, .pageChecklist:
                ForEach(node.items ?? []) { item in
                    if node.kind == .showChecklist {
                        Label(item.text, systemImage: item.done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.done ? .secondary : .primary)
                    } else {
                        Toggle(item.text, isOn: Binding(
                            get: { state?.values[node.id + "." + item.id]?.bool ?? item.done },
                            set: { checked in
                                enact(node, kind: .toggle, values: ["item": .text(item.id), "checked": .flag(checked)])
                            }
                        ))
                    }
                    if let note = item.note { Text(note).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
    }

    @ViewBuilder private func fieldView(_ field: VisualField, node: VisualNode) -> some View {
        if field.type == .select {
            Picker(field.label, selection: binding(for: field, node: node)) {
                Text("Select").tag("")
                ForEach(field.options ?? [], id: \.self) { option in Text(option).tag(option) }
            }
        } else {
            TextField(field.label, text: binding(for: field, node: node), axis: field.type == .textarea ? .vertical : .horizontal)
                .keyboardType(field.type == .email ? .emailAddress : field.type == .number ? .decimalPad : .default)
                .textInputAutocapitalization(field.type == .email ? .never : .sentences)
                .autocorrectionDisabled(field.type == .email)
                .disabled(isWaiting(node, kind: .submitForm))
        }
    }

    private func binding(for field: VisualField, node: VisualNode) -> Binding<String> {
        Binding(
            get: { state?.values[node.id + "." + field.id]?.string ?? "" },
            set: { value in enact(node, kind: .setField, values: [field.id: .text(value)]) }
        )
    }

    private func decision(_ decision: String, node: VisualNode) {
        enact(node, kind: .decide,
              values: ["decision": .text(decision), "note": .text(approvalNote)])
    }

    private func isWaiting(_ node: VisualNode, kind: VisualActionKind) -> Bool {
        state?.pending.contains(where: { $0.nodeID == node.id && $0.kind == kind }) ?? false
    }

    private func enact(_ node: VisualNode, kind: VisualActionKind, values: [String: VisualScalar]) {
        guard var current = state else { return }
        let action = VisualAction(id: UUID().uuidString, surfaceID: current.surface.surfaceID,
                                  expectedRevision: current.surface.revision, nodeID: node.id,
                                  kind: kind, values: values)
        do {
            try current.apply(action)
            try VisualSnapshotRepository(context: modelContext).save(current)
            state = current
            errorMessage = nil
        } catch { errorMessage = "Local validation failed: \(error.localizedDescription)" }
    }

    private func loadSnapshot() {
        do {
            let fixture = try SourceFixtures.surface()
            let repo = VisualSnapshotRepository(context: modelContext)
            let restored = try repo.load(surfaceID: fixture.surfaceID)
            let loaded = restored ?? VisualState(surface: fixture)
            if restored == nil { try repo.save(loaded) }
            state = loaded
            errorMessage = nil
        } catch { errorMessage = "Unable to restore saved fixture: \(error.localizedDescription)" }
    }
}
