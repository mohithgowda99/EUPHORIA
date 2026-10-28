# Phase 1 Agent B isolated native catalog continuation

## Scope and invariants

Feature branch only from `d66c5e0`. No `gateway/`, backend, `main` merge, recovery or Tasks execution changes. Extend `A2UIDocument` and `A2UICompositionView`; no second data store. Preserve existing SwiftData snapshot, `VisualState`, authorized action journal and artifact policy. Source: OpenDuet A2UI/CopilotKit pins and v0.9 source catalog (see acceptance document).

## TDD execution record

1. Pin all ten missing catalog component schemas, allowed properties, layouts and binding types. Inspect actual pinned source wrapper and v0.9 JSON schemas.
2. RED tests for nested List/media/Tabs/Modal, typed bounded slider/datetime, malformed unsafe input, stable edit after revision and Codable restore.
3. Add `A2UIExtendedCatalog` validation to existing document, integrate the ten native representations with the same recursive renderer. Reject unsupported template-scoped lists/functionCall/svgPath until native+gateway semantics are proven.
4. Run portable Swift test suite in a local isolated scaffold (18/18 after edits, 0 failures), preserving Xcode-only checks as **not run** in this Linux environment.
5. Publish feature branch only and hand off Xcode simulator/UI tests and gateway requirements for coordinated integration.

## Independent review checklist

- No executable JS or unreviewed native function call interpreted by generated UI.
- Source bindings remain typed and draft/acknowledgement semantics unchanged.
- HTTPS media only (stricter than source; clarify with Agent A).
- New native controls use one existing `A2UIDocument` and no separate state persistence.
- Dynamic list templates and relative-scoped bindings explicitly denied; no hidden partial success.
- Do not mark catalog complete without simulator tests for media, date/time, modal, tab restoration and source parity.


Follow-up: Added v0.9 JSON source graph tests (20/20 portable XCTest) and changed AVPlayer initialization to explicit user activation; indexed tabs use stable SwiftUI integer indices. No iOS simulator result available in this Linux environment.
