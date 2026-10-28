# A2UI-Swift feasibility and contained source-conformance spike

Date: 2026-10-28. Owner: Agent B; branch `feature/phase1-native-product-ui`. **Decision: ADAPT behind a test gate, NOT yet replace the live renderer.** Phase 1 is the exact OpenDuet mobile product port with OpenAI Agents API substituted for CopilotKit Intelligence. This report does not change source UI styling or gateway authority.

## Examined source/version and licensing

- Community renderer: `BBC6BAE9/a2ui-swift` `v0.3.5`, annotated release page https://github.com/BBC6BAE9/a2ui-swift/releases/tag/v0.3.5 (published 2026-06-25, marked prerelease), commit `4af5dda15dd050e091a80026b940cd41f8d5b93c`.
- **Spike actually pins:** `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0` (upstream default branch's inspected 2026-09-24 commit), as an **exact immutable SHA**, not `from: "0.3.0"` or moving `main`. No claim of compatibility without execution. Use `swift package resolve` to capture and review `Package.resolved`, then lock all transitive dependencies.
- Repository `LICENSE` is MIT ©2026 BBC6BAE9. Some upstream source files have Google LLC Apache-2.0 notices; retain those notices and conduct complete dependency/copyright review before distribution. Root MIT license does not erase notices in individual files.
- `v0.3.5/Package.swift` additionally pinned `swift-foundation-icu` at `swift-6.3.1-RELEASE`, and allows `swift-json-schema` `0.13.1..<0.14.0`. The newer inspected commit's `Package.swift` drops the FoundationICU dependency and uses Foundation-based pluralization, retains the swift-json-schema compatible range. This is one reason to test the newer exact commit instead of blindly using the older published tag.
- Products at newer pinned commit: `A2UISwiftCore`, `A2UISwiftUI`, `A2UIUIKit`, `A2UIAppKit`, plus legacy `v_08` and `Primitives`. The shipping spike only requests Core and SwiftUI. Minimum iOS 17 in upstream; EUPHORIA targets iOS 27.

## Comparison against pinned OpenDuet reference

OpenDuet source `openbot/app/src/lib/copilot/a2ui.tsx` wraps `basicCatalog` from `@copilotkit/a2ui-renderer@1.77.0` without rebuilding its semantics. `openbot/app/package.json` pins `1.77.0`. Agent A's `docs/contracts/a2ui-graph-v1.md` references `@a2ui/web_core@0.10.4`. The **exact installed npm tarball and WebCore tests have not been executed here**. Official v0.9 schema and the OpenDuet pinned renderer must be used for final differential validation; `v0.9.1` acceptance by community Swift does not authorize new source semantics.

| Contract | Existing EUPHORIA native | Community A2UI-Swift (source inspected) | Adoption condition |
|---|---|---|---|
| Standard message stream | Full normalized graph replacement and subtree update, no general source assembler | `MessageProcessor` handles create/update components/data/delete across surfaces; ordered batches with reported errors | Differential fixtures for partial messages, missing root, malformed update, cross-surface isolation and gateway revision order |
| Native tree/layout | 18 catalog names, but only a strict subset of actual properties; static child lists | `SurfaceViewModel` builds/reconciles `ComponentNode` tree; basic catalog SwiftUI implementation | Xcode Debug/Release, screenshot and interaction traces on same iPhone size as OpenDuet |
| Shared bindings | Bound object paths; local drafts in canonical `A2UIDocument` | `DataModel` + `DataContext` with relative/array paths and functions | Compare changed fields and serialized action contexts, keep EUPHORIA SwiftData authoritative |
| Repeated list | Dynamic template deliberately rejected | `resolveTemplateChildren` expands arrays/dictionaries and rebuilds on model update | Source renderer parity on reordered/deleted items and item-local events. **Array suffixes use indices**; UI-local state may be reassigned on reorder. Requires explicit negative regression |
| Tabs/Modal identity | Compilation bug fixed; selection and presentation now keyed by component ID and surface | Tree-keyed `ComponentUIState` reconciliation exists | Distinct tabs/modal interactions, server replacement, app kill/relaunch; no unbound simulated selection promoted to persisted authority |
| Actions/functions | Event-only, source-shaped action intent, never executes effects | `DataContext.resolveAction`, function registry, `A2uiClientAction` envelope | Audit function allowlist, disable privileged/external functions, reconstruct expected event server-side, preserve gateway journal and idempotency |
| Errors and update atomicity | Bounded complete-graph admission at gateway | Engine applies ordered messages, surfaces errors and continues batch | **Do not** assume native message processor is an authoritative atomic transaction; gateway admits whole revision and rejects invalid operations |
| Media and custom catalog | Strict HTTPS checks and partial media; custom source galleries are independent | Catalog registration and media nodes present | Proxy/revocation, redirect, dynamic SVG, permission checks, source visual fidelity |
| Snapshots/recovery | Existing SwiftData snapshots and gateway SQLite action journal | In-memory `SurfaceModel`; not a replacement for EUPHORIA persistence | Rebuild projection from canonical saved revisions on launch; never persist second source of truth |
| GenUI | Existing isolated WKWebView | Not applicable | Keep source `generative-ui.ts` and `sandboxed-tools.tsx` workflow separate, no JS-native privilege bridge |

## Actual implementation committed

The isolated, non-shipping `ios/Spikes/A2UIRendererComparison/` package:
- Pins community Swift to exact `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0`.
- `A2UIProjectionBridge.messages(from:)` turns an existing canonical document + unacknowledged local drafts into source `A2uiMessage` updates via JSON Codable. **It is an offline projection adapter only**. It neither writes SwiftData nor sends network actions. No edits to Agent A's gateway or to shipping `ios/VisualRuntimeCore/Package.swift`.
- Source-backed tests compare nested trip shared bindings, local draft roundtrip, extended settings graph tree, A2UI v0.9.1 decode, deletion, source user-event JSON wire, and dynamic template growth based on the upstream renderer's own test data. The candidate supports a real `{componentId,path}` template that the existing EUPHORIA subset intentionally rejects. These are test *definitions* until executed on Mac.
- The unchanged artifact isolation remains in `GeneratedArtifactView.swift` / `ArtifactPolicy.swift`.

**Compiler fix, independently implemented on Agent B branch:** `A2UICompositionView.swift` originally referenced undeclared `$selectedTabIndex` and `$isModalPresented`. It now uses bindings keyed by component ID, tab child identity instead of numerical index, per-modal presentation and scoped cleanup on surface/graph changes. `A2UIControlSelection.swift` is a pure helper; corresponding XCTest cases cover independent tabs, reorder, removed children and two modal IDs.

## Tests executed, NOT executed, and commands for Mac

**Executed here:** Linux Swift 6.2.1 `swiftc /tmp/euphoria_a2ui_control_selection.swift /tmp/main.swift` then the test binary, **5 deterministic assertions passed**. In a separate lightweight SwiftPM harness with equivalent committed `A2UIControlSelection.swift` and XCTest source, `swift test -j 2` passed **3 XCTest cases, 0 failures** (selection/reorder/removed child/modal identity). This tests isolated helper semantics, **not the checked-out iOS package or the iOS view**. The full repository's committed XCTest suite has not been executed. Environment: Linux x86_64, `swift` available, **no Xcode/xcodebuild**, GitHub clone DNS unavailable in container; cannot run community SPM package or simulator. No paid API/provider calls.

**Mac to execute in isolated Agent B checkout:**

```sh
cd ios/VisualRuntimeCore && swift test
cd ../Spikes/A2UIRendererComparison
swift package resolve
swift test
# Then real iOS Debug/Release + XCTest from the repository's existing Xcode workflow.
# Record xcodebuild commands, target device, commit and pass/fail logs.
```

Before adopting, run the pinned JS WebCore/CopilotKit fixture runner (source derived), test WebCore action payloads and repeated instance identity beside both native engines; run invalid messages, user-action retries, permission denial and restart. A quick `swift test` is not final evidence for native visual fidelity.

## Decision and blockers

**Recommendation: ADAPT if the parity spike passes; otherwise RETAIN and fix narrowly.** The community engine likely avoids rebuilding a parser, expression evaluator, binding engine, template expander and catalog. Adoption is conditional on exact OpenDuet source output, secure rendering, actual Xcode builds, correct item identity and *existing* EUPHORIA durable recovery. Do not replace the working app with an untested third-party component or rewrite its SwiftData model.

Agent A currently admits only 8 graph types and excludes dynamic children, deleteSurface, relative/array/escaped paths and functions. The candidate's capability surface **must not bypass that admission policy**. Gateway authorization, source event re-resolution, revisions and idempotent provider continuation still belong to Agent A. Request versioned capability negotiation and bounded full-graph admission from Agent A before live activation.

See `OPENDUET_SOURCE_FIDELITY_LEDGER.md` for 79-source-route parity. Phase 2 ETERNAL UI design is excluded from this milestone.
