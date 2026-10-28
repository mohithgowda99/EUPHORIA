import SwiftUI

/// One native renderer shared by offline fixtures and gateway-published surfaces.
struct VisualNodesView: View {
    let state: VisualState
    var fixture = false
    let onAction: (VisualNode, VisualActionKind, [String: VisualScalar]) -> Void
    @State private var errorMessage: String?
    var body: some View {
        if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        ForEach(state.surface.nodes) { node in section(for: node) }
    }
    @ViewBuilder private func section(for node: VisualNode) -> some View {
        Section(node.title) {
            if let summary = node.summary { Text(summary).font(.subheadline).foregroundStyle(.secondary) }
            switch node.kind {
            case .sourceComposition:
                if let document = try? state.compositionDocument(nodeID:node.id) {
                    A2UICompositionView(document: Binding(
                        get: { (try? state.compositionDocument(nodeID:node.id)) ?? document },
                        set: { edited in
                            guard let change=edited.localEdits.first(where:{document.localEdits[$0.key] != $0.value}),
                                  let component=document.components.first(where:{["TextField","CheckBox","ChoicePicker"].contains($0.component) && $0.properties["value"]?.object?["path"]?.text == change.key}) else {return}
                            do { enact(node,kind:.setField,values:["component":.text(component.id),"value":try change.value.nativeScalar()]) }
                            catch { errorMessage="This composition edit is unsupported." }
                        }
                    )) { event in
                        do { enact(node,kind:.submitForm,values:try state.compositionSubmissionValues(nodeID:node.id,buttonID:event.sourceComponentId)) }
                        catch {errorMessage="This composition action is unsupported."}
                    }
                    .disabled(isWaiting(node,kind:.submitForm))
                } else { Text("Composition unavailable").foregroundStyle(.secondary) }
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
                Button(node.submitLabel ?? (fixture ? "Submit form (local pending)" : "Submit form")) {
                    do {
                        enact(node, kind: .submitForm,
                              values: try state.proposedFormValues(nodeID: node.id))
                    } catch { errorMessage = "Form validation: \(error.localizedDescription)" }
                }
                .disabled(isWaiting(node, kind: .submitForm))
            case .askApproval:
                TextField("Optional decision note", text: Binding(
                    get: { state.approvalNote(nodeID: node.id) },
                    set: { enact(node, kind: .setField, values: ["note": .text($0)]) }
                ), axis: .vertical)
                .disabled(isWaiting(node, kind: .decide))
                HStack {
                    Button(fixture ? "Approve (fixture)" : "Approve") { decision("approved", node: node) }
                    Spacer()
                    Button(fixture ? "Decline (fixture)" : "Decline") { decision("declined", node: node) }
                }
                .disabled(isWaiting(node, kind: .decide))
                Text("This queues a response. It cannot authorize a real-world effect.")
                    .font(.caption).foregroundStyle(.secondary)
            case .gallery:
                if let gallery = node.gallery { VisualGalleryView(gallery: gallery) }
            case .htmlArtifact:
                if let html = node.html { GeneratedArtifactView(html: html) }
            case .showChecklist, .pageChecklist:
                ForEach(node.items ?? []) { item in
                    if node.kind == .showChecklist {
                        Label(item.text, systemImage: item.done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.done ? .secondary : .primary)
                    } else {
                        Toggle(item.text, isOn: Binding(
                            get: { state.values[node.id + "." + item.id]?.bool ?? item.done },
                            set: { checked in
                                enact(node, kind: .toggle, values: ["item": .text(item.id), "checked": .flag(checked)])
                            }
                        ))
                    }
                    if let note = item.note { Text(note).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .disabled(state.resolvedNodeIDs.contains(node.id))
    }

    @ViewBuilder private func fieldView(_ field: VisualField, node: VisualNode) -> some View {
        if field.type == .checkbox {
            Toggle(field.label, isOn: Binding(
                get: { state.formFieldData(nodeID: node.id, fieldID: field.id)?.bool ?? false },
                set: { enact(node, kind: .setField, values: [field.id: .flag($0)]) }
            ))
            .accessibilityIdentifier("source.boolean." + field.id)
            .disabled(isWaiting(node, kind: .submitForm))
        } else if field.type == .choice {
            VStack(alignment: .leading, spacing: 10) {
                if !field.label.isEmpty { Text(field.label).font(.subheadline.weight(.medium)) }
                ForEach(field.choices ?? [], id: \.wireID) { option in
                    let selected = state.formChoiceIsSelected(nodeID: node.id, fieldID: field.id, optionID: option.id)
                    Button {
                        do {
                            let value = try state.proposedChoiceValue(nodeID: node.id, fieldID: field.id, optionID: option.id)
                            enact(node, kind: .setField, values: [field.id: value])
                        } catch { errorMessage = "Selection is unavailable. Refresh the form." }
                    } label: {
                        HStack {
                            Image(systemName: field.allowsMultipleSelection == true ? (selected ? "checkmark.square.fill" : "square") : (selected ? "checkmark.circle.fill" : "circle"))
                            Text(option.label)
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                    .accessibilityValue(selected ? "Selected" : "Not selected")
                    .accessibilityIdentifier("source.choice." + field.id + "." + option.id)
                }
            }
            .disabled(isWaiting(node, kind: .submitForm))
        } else if field.type == .select {
            Picker(field.label, selection: binding(for: field, node: node)) {
                Text("Select").tag("")
                ForEach(field.options ?? [], id: \.self) { option in Text(option).tag(option) }
            }
            .disabled(isWaiting(node, kind: .submitForm))
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
            get: { state.formFieldValue(nodeID: node.id, fieldID: field.id) },
            set: { value in enact(node, kind: .setField, values: [field.id: .text(value)]) }
        )
    }

    private func decision(_ decision: String, node: VisualNode) {
        enact(node, kind: .decide,
              values: ["decision": .text(decision), "note": .text(state.approvalNote(nodeID: node.id))])
    }

    private func isWaiting(_ node: VisualNode, kind: VisualActionKind) -> Bool {
        state.resolvedNodeIDs.contains(node.id) || state.pending.contains(where: { $0.nodeID == node.id && $0.kind == kind })
    }


    private func enact(_ node: VisualNode, kind: VisualActionKind, values: [String: VisualScalar]) {
        onAction(node, kind, values)
    }
}
