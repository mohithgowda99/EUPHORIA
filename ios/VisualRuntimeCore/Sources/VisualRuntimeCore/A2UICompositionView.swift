#if canImport(SwiftUI)
import SwiftUI

/// Reusable native A2UI v0.9 subset. The parent supplies the existing SwiftData-backed
/// snapshot Binding and authorized gateway action dispatch; this view owns neither.
/// Unknown components must fail validation before they reach this renderer.
@MainActor
public struct A2UICompositionView: View {
    @Binding private var document: A2UIDocument
    private let onAction: (A2UIActionIntent) -> Void
    @State private var errorMessage: String?

    public init(document: Binding<A2UIDocument>, onAction: @escaping (A2UIActionIntent) -> Void) {
        _document = document
        self.onAction = onAction
    }

    public var body: some View {
        A2UIRecursiveNode(document: $document, id: "root", onAction: onAction)
    }
}

@MainActor
private struct A2UIRecursiveNode: View {
    @Binding var document: A2UIDocument
    let id: String
    let onAction: (A2UIActionIntent) -> Void
    @State private var errorMessage: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            nodeContent
            if let errorMessage { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
        }
    }
    private func content(for id: String) -> A2UIRecursiveNode {
        A2UIRecursiveNode(document: $document, id: id, onAction: onAction)
    }
    @ViewBuilder
    private var nodeContent: some View {
        if let node = document.components.first(where: { $0.id == id }) {
            switch node.component {
            case "Column":
                VStack(alignment:.leading,spacing:12) {
                    ForEach(children(of:node),id:\.self) { child in content(for:child) }
                }
                .accessibilityIdentifier("a2ui."+id)
            case "Row":
                HStack(alignment:.center,spacing:12) {
                    ForEach(children(of:node),id:\.self) { child in content(for:child) }
                }
                .accessibilityIdentifier("a2ui."+id)
            case "Card":
                if let child=node.properties["child"]?.text {
                    content(for:child).padding(12)
                        .frame(maxWidth:.infinity,alignment:.leading)
                        .background(.regularMaterial,in:RoundedRectangle(cornerRadius:14))
                        .accessibilityIdentifier("a2ui."+id)
                }
            case "Text":
                Text(text(node,"text"))
                    .font(textFont(node.properties["variant"]?.text))
                    .accessibilityIdentifier("a2ui."+id)
            case "Button":
                if let child=node.properties["child"]?.text {
                    if node.properties["variant"]?.text == "borderless" {
                        Button { submit(node) } label: { content(for:child) }
                            .buttonStyle(.borderless).accessibilityIdentifier("a2ui."+id)
                    } else {
                        Button { submit(node) } label: { content(for:child) }
                            .buttonStyle(.borderedProminent).accessibilityIdentifier("a2ui."+id)
                    }
                }
            case "TextField":
                TextField(text(node,"label"),text:Binding(
                    get:{ text(node,"value") },
                    set:{ edit(node,.string($0)) }
                ))
                .textFieldStyle(.roundedBorder)
                .disabled(!isBound(node))
                .accessibilityIdentifier("a2ui."+id)
            case "CheckBox":
                Toggle(text(node,"label"),isOn:Binding(
                    get:{ (try? document.value(id:node.id,property:"value"))?.boolean ?? false },
                    set:{ edit(node,.bool($0)) }
                ))
                .disabled(!isBound(node))
                .accessibilityIdentifier("a2ui."+id)
            case "ChoicePicker":
                VStack(alignment:.leading,spacing:8) {
                    Text(text(node,"label")).font(.caption)
                    ForEach(choices(node)) { option in
                        let picked=selection(node).contains(where:{visualWireStringEqual($0,option.value)})
                        Button {
                            var updated=selection(node)
                            if node.properties["variant"]?.text == "mutuallyExclusive" {
                                updated=[option.value]
                            } else if picked { updated.removeAll(where:{visualWireStringEqual($0,option.value)}) }
                            else {updated.append(option.value)}
                            edit(node,.array(updated.map(A2UIValue.string)))
                        } label: {
                            Label(option.label,systemImage:picked ? "checkmark.circle.fill" : "circle")
                        }
                        .buttonStyle(.borderless)
                        .disabled(!isBound(node))
                        .accessibilityIdentifier("a2ui."+id+"."+option.value)
                    }
                }
            default:
                Text("Unsupported A2UI component").foregroundStyle(.red)
            }
        } else {
            Text("Missing A2UI component").foregroundStyle(.red)
        }
    }

    private func children(of node:A2UIComponent) -> [String] {
        guard case .array(let children)?=node.properties["children"] else {return []}
        return children.compactMap(\.text)
    }
    private func text(_ node:A2UIComponent,_ property:String)->String {
        (try? document.value(id:node.id,property:property))?.text ?? ""
    }
    private func selection(_ node:A2UIComponent)->[String] {
        guard case .array(let list)?=(try? document.value(id:node.id,property:"value")) else {return []}
        return list.compactMap(\.text)
    }
    private struct ChoiceItem: Identifiable {
        let value:String
        let label:String
        var id:[UInt16] {visualWireStringKey(value)}
    }
    private func choices(_ node:A2UIComponent)->[ChoiceItem] {
        guard case .array(let opts)?=node.properties["options"] else {return []}
        return opts.compactMap { option -> ChoiceItem? in
            guard let obj=option.object,let value=obj["value"]?.text,let label=try? document.resolve(obj["label"] ?? .null),let s=label.text else {return nil}
            return ChoiceItem(value:value,label:s)
        }
    }
    private func textFont(_ variant:String?) -> Font {
        switch variant {
        case "h1": return .largeTitle
        case "h2": return .title
        case "h3": return .title2
        case "h4": return .title3
        case "h5": return .headline
        case "caption": return .caption
        default: return .body
        }
    }
    private func isBound(_ node:A2UIComponent)->Bool {
        guard let obj=node.properties["value"]?.object else {return false}
        return obj.count == 1 && obj["path"]?.text != nil
    }
    private func edit(_ node:A2UIComponent,_ value:A2UIValue) {
        do {
            var copy=document
            _=try copy.edit(componentID:node.id,value:value)
            document=copy // Parent persists with existing SwiftData and journals actions separately.
            errorMessage=nil
        } catch { errorMessage="This control cannot accept that value." }
    }
    private func submit(_ node:A2UIComponent) {
        do {
            let event=try document.makeEvent(buttonID:node.id,
                timestamp:ISO8601DateFormatter().string(from:Date()),
                idempotencyKey:UUID().uuidString)
            // No automatic network call. The host persists intent before authorized gateway delivery.
            onAction(event)
            errorMessage=nil
        } catch {errorMessage="This action needs a valid interface state."}
    }
}
#endif
