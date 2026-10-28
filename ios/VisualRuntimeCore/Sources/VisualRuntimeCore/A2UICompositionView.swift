#if canImport(SwiftUI)
import SwiftUI
import AVKit

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
        VStack(alignment: .leading, spacing: 12) {
            content(for:"root")
            if let errorMessage {
                Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    .accessibilityIdentifier("a2ui.validation-error")
            }
        }
    }

    @ViewBuilder
    private func content(for id:String) -> some View {
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
            case "List":
                if node.properties["direction"]?.text == "horizontal" {
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .center, spacing: 12) {
                            ForEach(children(of:node),id:\.self) { child in content(for:child) }
                        }
                    }.accessibilityIdentifier("a2ui."+id)
                } else {
                    ScrollView(.vertical) {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(children(of:node),id:\.self) { child in content(for:child) }
                        }
                    }.accessibilityIdentifier("a2ui."+id)
                }
            case "Divider":
                if node.properties["axis"]?.text == "vertical" {
                    Rectangle().fill(.separator).frame(width:1).frame(minHeight:32)
                } else { Divider() }
            case "Tabs":
                let tabs = tabEntries(node)
                if !tabs.isEmpty {
                    Picker("Sections",selection:$selectedTabIndex) {
                        ForEach(Array(tabs.enumerated()),id:\.offset) { index,tab in
                            Text(tab.title).tag(index)
                        }
                    }.pickerStyle(.segmented)
                    if tabs.indices.contains(selectedTabIndex) { content(for:tabs[selectedTabIndex].child) }
                }
            case "Modal":
                if let trigger = node.properties["trigger"]?.text,
                   let target = node.properties["content"]?.text {
                    Button {
                        isModalPresented = true
                    } label: {
                        if let triggerNode=document.components.first(where:{$0.id==trigger}),
                           triggerNode.component == "Button",
                           let labelID=triggerNode.properties["child"]?.text { content(for:labelID) }
                        else {content(for:trigger)}
                    }
                    .sheet(isPresented:$isModalPresented) {
                        NavigationStack {
                            ScrollView {content(for:target).padding()}
                                .toolbar { ToolbarItem(placement:.confirmationAction) {
                                    Button("Done") {isModalPresented=false}
                                }}
                        }
                    }
                }
            case "Image":
                if let url=URL(string:text(node,"url")) {
                    AsyncImage(url:url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: node.properties["fit"]?.text == "cover" ? .fill : .fit)
                        case .failure: Label("Image unavailable",systemImage:"photo")
                        default: ProgressView()
                        }
                    }.frame(height:140).clipped().accessibilityLabel(text(node,"description"))
                }
            case "Icon":
                Image(systemName: iconName(text(node,"name")))
                    .accessibilityIdentifier("a2ui."+id)
            case "Video", "AudioPlayer":
                if let url=URL(string:text(node,"url")) {
                    A2UIMediaPlayer(url:url, audioOnly:node.component == "AudioPlayer",
                                   title:text(node,"description"))
                }
            case "Slider":
                let minimum = number(node.properties["min"]) ?? 0
                let maximum = number(node.properties["max"]) ?? 1
                VStack(alignment:.leading) {
                    Text(text(node,"label")).font(.caption)
                    Slider(value:Binding(
                        get:{ number(try? document.value(id:node.id,property:"value")) ?? minimum },
                        set:{ edit(node,.number($0)) }
                    ),in:minimum...maximum)
                    .disabled(!isBound(node))
                }.accessibilityIdentifier("a2ui."+id)
            case "DateTimeInput":
                let showDate=node.properties["enableDate"]?.boolean ?? false
                let showTime=node.properties["enableTime"]?.boolean ?? false
                let shown: DatePickerComponents = showDate && showTime ? [.date,.hourAndMinute] : showDate ? [.date] : [.hourAndMinute]
                DatePicker(text(node,"label"),selection:Binding(
                    get:{ parseDate(text(node,"value"),date:showDate,time:showTime) },
                    set:{ edit(node,.string(formatDate($0,date:showDate,time:showTime))) }
                ),displayedComponents:shown)
                .disabled(!isBound(node))
                .accessibilityIdentifier("a2ui."+id)
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
                        let picked=selection(node).contains(option.value)
                        Button {
                            var updated=selection(node)
                            if node.properties["variant"]?.text == "mutuallyExclusive" {
                                updated=[option.value]
                            } else if picked { updated.removeAll(where:{$0==option.value}) }
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

    private struct TabEntry { let title:String;let child:String }
    private func tabEntries(_ node:A2UIComponent)->[TabEntry] {
        guard case .array(let values)?=node.properties["tabs"] else {return []}
        return values.compactMap { raw in
            guard let props=raw.object,let child=props["child"]?.text,
                  let titleRaw=props["title"],let title=(try? document.resolve(titleRaw))?.text else {return nil}
            return TabEntry(title:title,child:child)
        }
    }
    private func number(_ value:A2UIValue?)->Double? {
        if case .number(let n)?=value {return n};return nil
    }
    private func iconName(_ name:String)->String {
        let mapping:[String:String] = ["home":"house", "add":"plus", "arrowBack":"arrow.left", "arrowForward":"arrow.right",
            "check":"checkmark", "close":"xmark", "delete":"trash", "download":"arrow.down.to.line",
            "edit":"pencil", "folder":"folder", "help":"questionmark.circle", "info":"info.circle",
            "lock":"lock", "lockOpen":"lock.open", "mail":"envelope", "menu":"line.3.horizontal",
            "person":"person", "photo":"photo", "play":"play", "pause":"pause", "search":"magnifyingglass",
            "send":"paperplane", "settings":"gearshape", "share":"square.and.arrow.up", "star":"star",
            "stop":"stop", "upload":"arrow.up.to.line", "warning":"exclamationmark.triangle"]
        return mapping[name] ?? "questionmark.square.dashed"
    }
    private func parseDate(_ string:String,date:Bool,time:Bool)->Date {
        if date && time {return ISO8601DateFormatter().date(from:string) ?? Date(timeIntervalSince1970:0)}
        let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=TimeZone(secondsFromGMT:0)
        f.dateFormat=date ? "yyyy-MM-dd" : "HH:mm:ss"
        return f.date(from:string) ?? Date(timeIntervalSince1970:0)
    }
    private func formatDate(_ value:Date,date:Bool,time:Bool)->String {
        if date && time {return ISO8601DateFormatter().string(from:value)}
        let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=TimeZone(secondsFromGMT:0)
        f.dateFormat=date ? "yyyy-MM-dd" : "HH:mm:ss"
        return f.string(from:value)
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
        var id:String {value}
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
@MainActor
private struct A2UIMediaPlayer: View {
    let url:URL
    let audioOnly:Bool
    let title:String
    @State private var player:AVPlayer?
    var body:some View {
        Group {
            if audioOnly {
                HStack {
                    Text(title.isEmpty ? "Audio" : title)
                    Spacer()
                    Button("Play") {player?.play()}
                    Button("Pause") {player?.pause()}
                }
            } else if let player {VideoPlayer(player:player).frame(height:200)}
            else {ProgressView()}
        }
        .task(id:url) {player=AVPlayer(url:url)}
        .onDisappear {player?.pause()}
    }
}

#endif
