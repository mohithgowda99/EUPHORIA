import Foundation

/// Transcribed from actual OpenDuet component previews, not synthetic agent output.
/// See: components/gallery/decisions.tsx, form.tsx and cards.tsx; page-view.tsx.
public enum SourceFixtures {
    public static func compositionSurface(choice:Bool = false) throws -> VisualSurface {
        try compositionFixture(choice ? "a2ui-choice-deployment-v09" : "a2ui-nested-trip-v09",title:choice ? "Deployment choice" : "Trip composition")
    }
    public static func layoutSurface() throws -> VisualSurface {try compositionFixture("a2ui-layout-v09",title:"Research brief")}
    public static func numericDateSurface() throws -> VisualSurface {try compositionFixture("a2ui-numeric-date-v09",title:"Decision controls")}
    private static func compositionFixture(_ name:String,title:String) throws -> VisualSurface {
        #if SWIFT_PACKAGE
        let bundle=Bundle.module
        #else
        let bundle=Bundle.main
        #endif
        guard let url=bundle.url(forResource:name,withExtension:"json") else {throw VisualContractError.invalidSurface}
        let document=try JSONDecoder().decode(A2UIDocument.self,from:Data(contentsOf:url))
        return try VisualSurface(surfaceID:"source-study-"+document.surfaceId,revision:document.revision,nodes:[VisualNode(id:"composition",kind:.sourceComposition,title:title,composition:document)],schemaVersion:2)
    }
    public static func a2uiControlsSurface() throws -> VisualSurface { try bundledSurface("a2ui-controls-native") }
    public static func a2uiFormSurface() throws -> VisualSurface { try bundledSurface("a2ui-trip-native") }
    public static func gallerySurface() throws -> VisualSurface { try bundledSurface("gallery-v2") }
    private static func bundledSurface(_ name: String) throws -> VisualSurface {
        #if SWIFT_PACKAGE
        let bundle = Bundle.module
        #else
        let bundle = Bundle.main
        #endif
        guard let url = bundle.url(forResource: name, withExtension: "json") else { throw VisualContractError.invalidSurface }
        let surface = try JSONDecoder().decode(VisualSurface.self, from: Data(contentsOf: url))
        try surface.validate()
        return surface
    }

    public static func surface() throws -> VisualSurface {
        try VisualSurface(surfaceID: "openduet-reference-fixture", revision: 1, nodes: [
            VisualNode(id: "deployment", kind: .askChoice,
                       title: "Which environment should this go to?",
                       summary: "The build is green and nothing else is queued.", options: [
                        VisualOption(id: "staging", label: "Staging", description: "Safe, and reversible"),
                        VisualOption(id: "production", label: "Production", description: "Live customers")
                       ]),
            VisualNode(id: "brief", kind: .askForm, title: "Plan your next project",
                       summary: "A few details to prepare a useful first draft.", fields: [
                        VisualField(id: "team", label: "Team name", type: .text, required: true),
                        VisualField(id: "email", label: "Work email", type: .email, required: true),
                        VisualField(id: "priority", label: "Priority", type: .select,
                                    options: ["This week", "This month", "Exploring"]),
                        VisualField(id: "seats", label: "People involved", type: .number, min: 1),
                        VisualField(id: "notes", label: "What would a good outcome look like?", type: .textarea)
                       ]),
            VisualNode(id: "refund", kind: .askApproval, title: "Refund this order?",
                       summary: "The customer was charged twice for the same order and the second charge has not settled."),
            VisualNode(id: "release", kind: .showChecklist, title: "Before the release", items: [
                VisualChecklistItem(id: "migrations", text: "Migrations applied", done: true),
                VisualChecklistItem(id: "changelog", text: "Changelog written", done: true),
                VisualChecklistItem(id: "loadtest", text: "Load test", done: false, note: "Waiting on staging")
            ]),
            // Interactive checkboxes exist in page-view/page-rich-block, not in showChecklist.
            VisualNode(id: "page_tasks", kind: .pageChecklist, title: "Editable page tasks", items: [
                VisualChecklistItem(id: "review", text: "Review native visual contract", done: false),
                VisualChecklistItem(id: "record", text: "Record integration evidence", done: false)
            ])
        ])
    }
}
