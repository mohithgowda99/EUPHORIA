# EUPHORIA / Agent B: pinned A2UI v0.9 catalog acceptance

**Starting baseline:** `d66c5e02e33c042081639e8580c92e8ea1b96bfa` on `feature/agents-native-visual-contract-spike`. Independent feature branch `feature/phase1-native-product-ui`. These changes do not touch gateway, OpenBot, task/pagination/session recovery or the integration branch.

## Authoritative sources

- OpenDuet: `openbot/app/src/lib/copilot/a2ui.tsx` wraps `@copilotkit/a2ui-renderer@1.77.0` `basicCatalog` unchanged; `openbot/app/package.json` pins 1.77.0, `@ag-ui/core@1.0.1`. The source includes a distinct Open GenUI route under `generative-ui.ts`/`provider.tsx`.
- A2UI v0.9 component schema: https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/catalogs/basic/catalog.json
- A2UI v0.9 common types and binding/action definitions: https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/common_types.json
- Server messages: https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/server_to_client.json ; client actions: https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/client_to_server.json
- EUPHORIA's existing value/tree implementation `ios/VisualRuntimeCore/Sources/VisualRuntimeCore/A2UIComposition.swift` and native SwiftUI `A2UICompositionView.swift`. Accepted architecture: one SwiftData-backed `VisualState`, gateway session ownership and durable action journal; no separate renderer/store.

The upstream schema repository `main` documents v0.9; it is a source-backed schema reference, **not binary verification of the exact vendored 1.77.0 npm artifact**. Pinned package conformance remains an outstanding dedicated test.

## Component coverage: properties, interaction, streaming, restoration and tests

`Local` means the portable core has source-shaped fixtures. `Native` means SwiftUI code is implemented but **has not been run in Xcode for this branch**. `Partial` identifies semantic differences; nothing in this matrix means full catalog parity.

| Component | Pinned source props and tree semantics | Native/behavior in this branch | Acceptance still open |
|---|---|---|---|
| Text | `text` dynamic string, `variant` h1..h5/caption/body | Existing native static/bound text, dynamic update | Markdown layout, attributed styles, incremental stream lifecycle |
| Image | `url`, `description`, `fit`, `variant` | **Local+Native, partial:** HTTPS-only URL validation; `AsyncImage`, placeholder/failure. | Fit variants, caching, alt semantics, image types, sandboxed URL grants, simulator load |
| Icon | `name` pinned names or `svgPath` or binding | **Local+Native, partial:** enumerated safe icon names and SF Symbols mapping; no executable SVG. | All exact glyphs, safe reviewed SVG path parser, dynamically bound SVG |
| Video | `url` dynamic string | **Local+Native, partial:** HTTPS-only `AVPlayer`/`VideoPlayer`, pause on disappearance. | Real media interruptions, buffering, background policies, media auth, simulator test |
| AudioPlayer | `url`, `description` | **Local+Native, partial:** bound AVPlayer with play/pause and label. | Playback/seek/progress, interruptions, complete accessibility semantics |
| Row | `children` list/template, `justify`, `align` | Existing nested static children with stable IDs. | Alignment/justify, repeated templates, tested layout fidelity |
| Column | same as Row | Existing nested static children with stable IDs. | Alignment/justify, repeated templates, tested layout fidelity |
| List | `children` list or `{componentId,path}` template, `direction`, `align` | **Local+Native, partial:** static-ID `ScrollView` with native lazy stack, direction. | Dynamic templates, scoped relative paths and persistent per-instance identities, align |
| Card | `child` ID | Existing material-styled SwiftUI nested child. | Styling exactness, view state through replacement |
| Tabs | `tabs:[{title,child}]` | **Local+Native, partial:** native segmented picker and referenced child. | Persisted selected tab, source binding and long-title layout behavior |
| Modal | `trigger`, `content` ID refs | **Local+Native, partial:** native `.sheet`, content/trigger refs, dismiss control. | Parity with source trigger action routing, keyboard/modal selection restoration |
| Divider | `axis` horizontal/vertical | **Local+Native:** Divider/vertical separator. | Simulator layout and styling comparison |
| Button | child ID, variant, action event or functionCall | Existing event action to caller, never executes external tool. | FunctionCall (reviewed function registry), action replay/rejection |
| TextField | label/value dynamic, variant, regexp | Existing two-way bound native text. | regexp, variants, invalid/empty and live validation UX |
| CheckBox | label/value boolean | Existing boolean shared binding and drafts. | Two-way streaming reconcile and simulator validation |
| ChoicePicker | options, value string[], variant, displayStyle/filterable | Existing choices and exclusive/multiple mode. | Filtering/display variants, translated source functions |
| Slider | `value` dynamic number, numeric min/max, optional label | **Local+Native, partial:** bounded numeric edits, native Slider; drafts restored in A2UIDocument snapshot. | Source exact drag/no-step semantics and simultaneous remote update testing |
| DateTimeInput | ISO string, enableDate/Time, min/max, label | **Local+Native, partial:** native DatePicker, ISO formatting, draft binding. | UTC/time-zone semantics, DST, min/max actual picker range, date-only correctness |

**Security gates:** all new media URLs must be HTTPS without embedded credentials, function calls remain unsupported, unknown keys/types reject at decode/validation, icon `svgPath` is not interpreted, and dynamic list templates fail closed rather than rendering incorrectly. This is *stricter* than arbitrary source URLs and must be resolved with a gateway media admission policy before claiming full source compatibility.

## Dynamic children and source graph operations

A2UI v0.9 `ChildList` can be a static array of IDs or an object `{"componentId":"row","path":"/items"}`. In templates, relative bindings resolve in each row's item scope; adopting `ForEach([index])` without real per-instance state would mix edits and action sources. **Not implemented**. The existing `A2UIDocument.updateComponents` accepts a validated replacement graph and `updateDataModel` applies one revisioned subtree replace/remove; a full `createSurface/updateComponents/updateDataModel/deleteSurface` source packet assembler and per-packet acknowledgements still need gateway admission and canonical revision ordering. Do not claim full streaming or deletion parity from a replacement-only helper.

## Regression evidence and explicit gaps

The isolated portable Swift 6.2.1 verification scaffold executes original composition tests plus the new `A2UIExtendedCatalogTests` and source fixtures. It verifies nested static components, tabs/modal ID references, slider typed shared-state edits/remote updates, date validation, malformed/unsafe nodes, canonical snapshot Codable roundtrip, stale component replacement. The scaffold uses the previous isolated composition source and a local identity shim because GitHub was not network-mountable in the Linux runtime. **The final merged branch must be built/tested on the actual Mac Xcode 27 checkout before these tests count as integration proof.**

Artifact sandbox remains the existing `GeneratedArtifactView`/`ArtifactPolicy` and is untouched; no WebKit security downgrade or JS bridge. GenUI tool-to-artifact publish, signed revision lifecycle, typed safe actions, visual history and revocation require gateway endpoints and future native implementation. See gateway handoff.
