import SwiftUI

/// Native original OpenDuet Make and gallery records. The PageStore still
/// owns page IDs, revisions, checklists and history, not OpenAI session items.
struct SourceGalleryView: View {
    @State private var client: OpenDuetSourceAPI?
    @State private var pages: [SourcePageSummary] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    Button("Retry read") { Task { await refresh() } }
                }
            }
            ForEach(pages) { page in
                NavigationLink {
                    if let client { SourcePageDetailView(client: client, pageID: page.id) }
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(page.title).font(.headline)
                        if let summary = page.summary { Text(summary).font(.subheadline).foregroundStyle(.secondary) }
                        Text(page.kind.replacingOccurrences(of: "-", with: " ").capitalized)
                            .font(.caption).foregroundStyle(.secondary)
                        if let first = page.preview.blocks.first,
                           let line = first.text, !line.isEmpty {
                            Text(line).font(.caption).lineLimit(2)
                        }
                    }
                }
            }
            if pages.isEmpty && !loading && error == nil {
                ContentUnavailableView("No generated pages", systemImage: "square.stack",
                    description: Text("The original Make service will show saved pages and decks here."))
            }
            if loading { ProgressView("Reading original generated pages…") }
        }
        .navigationTitle("Make & Gallery")
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let source = try SavedOpenDuetAccount.client()
            _ = try await source.sourceSession()
            pages = try await source.sourcePages()
            client = source
            error = nil
        } catch {
            client = nil
            error = "Original Make pages cannot be loaded. Sign in through Bots, then retry."
        }
    }
}

/// Generic source block presentation, not app-domain widget templates.
/// Unsupported visual types are labelled rather than claimed as complete.
struct SourcePageDetailView: View {
    let client: OpenDuetSourceAPI
    let pageID: String
    @State private var page: SourcePageRecord?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List {
            if let page {
                if let summary = page.summary {
                    Section { Text(summary).foregroundStyle(.secondary) }
                }
                if let blocks = page.content.blocks {
                    ForEach(blocks.indices, id: \.self) { index in
                        Section {
                            SourcePageBlockView(block: blocks[index]) { itemID, checked in
                                Task { await check(block: index, slide: nil, itemID: itemID, checked: checked) }
                            }
                        }
                    }
                }
                if let slides = page.content.slides {
                    ForEach(slides.indices, id: \.self) { slideIndex in
                        Section(slides[slideIndex].title) {
                            ForEach(slides[slideIndex].blocks.indices, id: \.self) { blockIndex in
                                SourcePageBlockView(block: slides[slideIndex].blocks[blockIndex]) { itemID, checked in
                                    Task { await check(block: blockIndex, slide: slideIndex, itemID: itemID, checked: checked) }
                                }
                            }
                        }
                    }
                }
            } else if !busy {
                Text(error ?? "Page unavailable.").foregroundStyle(.secondary)
            }
            if let error {
                Text(error).foregroundStyle(.red)
                Button("Refresh original page") { Task { await reload() } }.disabled(busy)
            }
            if busy { ProgressView("Loading original page…") }
        }
        .navigationTitle(page?.title ?? "Page")
        .refreshable { await reload() }
        .task(id: pageID) { await reload() }
    }

    private func reload() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            page = try await client.sourcePage(id: pageID)
            error = nil
        } catch {
            error = "Could not read the original PageStore record."
        }
    }

    private func check(block: Int, slide: Int?, itemID: String, checked: Bool) async {
        guard !busy, let page else { return }
        busy = true
        defer { busy = false }
        do {
            self.page = try await client.setSourceChecklistItem(pageID: pageID, block: block,
                slide: slide, itemID: itemID, checked: checked, revision: page.checklistRevision)
            error = nil
        } catch {
            // The source rejects stale checklistRevision with conflict.
            // Refresh instead of blindly replaying a write against new content.
            error = "This checklist changed or could not be confirmed. Refresh the original page first."
        }
    }
}

/// The source PageContent schema is an open library of reusable blocks.
/// Actions are restricted to original checklist fields with revision CAS.
struct SourcePageBlockView: View {
    let block: SourcePageBlock
    let onCheck: (String, Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch block.type {
            case "heading":
                Text(block.text ?? "").font(.title3.weight(.semibold))
            case "text":
                Text(block.text ?? "").textSelection(.enabled)
            case "bullets":
                ForEach(Array((block.items ?? []).enumerated()), id: \.offset) { _, item in
                    Label(item.text ?? "", systemImage: "circle.fill")
                }
            case "list", "metrics", "bars", "timeline":
                if let title = block.title { Text(title).font(.headline) }
                ForEach(Array((block.items ?? []).enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.text ?? item.title ?? item.label ?? "Item")
                        if let number = item.value { Text(number).font(.headline) }
                        if let date = item.date { Text(date).font(.caption).foregroundStyle(.secondary) }
                        if let note = item.note { Text(note).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            case "checklist":
                ForEach(Array((block.items ?? []).enumerated()), id: \.offset) { _, item in
                    Toggle(item.text ?? "Checklist item", isOn: Binding(
                        get: { item.checked ?? false },
                        set: { value in if let id = item.id { onCheck(id, value) } }
                    ))
                    .disabled(item.id == nil)
                }
            case "table":
                if let columns = block.columns, let rows = block.rows {
                    Text(columns.joined(separator: " · ")).font(.headline)
                    ForEach(rows.indices, id: \.self) { index in
                        Text(rows[index].joined(separator: " · "))
                    }
                } else {
                    Text("This table cannot be previewed.").foregroundStyle(.secondary)
                }
            case "decision":
                Text(block.question ?? "Decision").font(.headline)
                ForEach(Array((block.options ?? []).enumerated()), id: \.offset) { _, option in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(option.title)
                        ForEach(option.pros, id: \.self) { value in Text("+ " + value).font(.caption) }
                        ForEach(option.cons, id: \.self) { value in Text("− " + value).font(.caption) }
                    }
                }
                if let chosen = block.pick { Text("Selected: " + chosen) }
            case "image":
                Label(block.alt ?? "Generated illustration", systemImage: "photo")
                Text("Static source SVG rendering is not yet available in this native preview.")
                    .font(.caption).foregroundStyle(.secondary)
            default:
                Text("Unsupported source block: " + block.type)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
