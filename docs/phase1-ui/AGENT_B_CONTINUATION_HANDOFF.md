# Agent B handoff: Phase 1 OpenDuet fidelity + A2UI Swift spike

Date: 2026-10-28. Target branch: `feature/phase1-native-product-ui`; source baseline `d549dfee7a1f53b1950546a763c46dfcd5fa76e5`. This handoff was drafted after `44cffe2081dfbc8294d5a30db46cde506d38dfe9`; inspect actual HEAD before work. Agent A independently owns `feature/agents-native-visual-contract-spike` and every live gateway/backend file. **Never merge or rewrite either branch without a coordinated integration decision.**

## Product contract

Phase 1 = reproduce OpenDuet **as-is on iPhone** with native SwiftUI screens and unchanged source interaction semantics, using OpenAI Agents API instead of CopilotKit Intelligence. NOT an ETERNAL redesign. Keep controlled product UI, standard A2UI v0.9 and open HTML/CSS/JS GenUI separate. No fake task IDs, session-as-task substitution, static replacement flows, no-op actions or unauthorized provider executions. Phase 2 later introduces ETERNAL aesthetics.

- `docs/phase1-ui/OPENDUET_SOURCE_FIDELITY_LEDGER.md`: complete inventory of the 79 source route modules and six-proof acceptance criteria, plus source-confirmed overlay/navigation/redirect details.
- `docs/phase1-ui/NATIVE_SCREEN_ACCEPTANCE_MATRIX.md`: product families and original expected behavior.
- `docs/phase1-ui/A2UI_SWIFT_FEASIBILITY.md`: exact third-party commits, license/dependencies, comparison, risks, test commands and conditional **ADAPT** decision.
- `docs/phase1-ui/AGENT_A_GATEWAY_HANDOFF.md`: prioritized precise frontend-to-backend blockers and fixture requests.

## Implemented on this feature branch

1. Fixed undeclared SwiftUI `$selectedTabIndex`/`$isModalPresented` in `A2UICompositionView.swift`. Tabs now use per-component child identity; Modal presentation is per component. State is cleared on changed surface and removed nodes. `A2UIControlSelection.swift` + XCTest regression source cover two independent Tabs/Modals, reorder and removed tab fallback.
2. Isolated `ios/Spikes/A2UIRendererComparison` SPM package pins `BBC6BAE9/a2ui-swift` at exact SHA `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0`. No shipping dependency or alternate store. `A2UIProjectionBridge` reconstructs standard v0.9 message batches from existing canonical `A2UIDocument`, including local drafts.
3. Comparison *test definitions* cover EUPHORIA's source-derived nested trip/settings fixtures, action v0.9 wire schema, dynamic array list fixture derived from upstream Swift renderer's reconciliation tests, revision-independent restoration and deletion.
4. Accepted user clarification was recorded in `docs/DECISIONS.md`; all 79 original routes are accounted for in the ledger. No Agent A or GenUI isolation code modified.

## Evidence and limitations

- **Actually executed:** standalone Linux Swift 6.2.1 harness equivalent to the new committed helper + XCTest, `swift test -j 2`: **3 tests passed**, zero failures. Also a separate `swiftc` binary with five assertions passed.
- **NOT executed:** actual EUPHORIA/Xcode Debug and Release, source iOS XCTest/UI tests, candidate package resolution/tests, iPhone simulator gestures, 1.77.0 WebCore differential runner or provider end-to-end. Container has no Xcode; GitHub git clone DNS blocked. No paid API calls. Remote GitHub writes were applied directly; local Mac uncommitted state is **not visible** and must be preserved.
- A2UI-Swift `v0.3.5` is MIT-root prerelease, source includes Google Apache-2.0 headers, and pinned release also has `swift-foundation-icu` dependency. Newer exact spike commit drops that transitive ICU dependency. Full dependency license and release readiness is a gate.
- **P0 product deviation:** current iOS `ContentView` still opens a WorkList of gateway session envelopes labeled Tasks. OpenDuet source home actually opens `ChatScreen`, and Tasks uses actual Task records/questions/reports. Do not claim these native screens source-equivalent until Agent A exposes real contracts and Agent B ports the actual mobile flows.

**Fresh Agent A task service (verify before coding):** At `10617b70d573c812d21d383b7388b9a7bce30eb2`, `docs/contracts/tasks-v1.md` specifies real owner-scoped task APIs (`POST /v1/tasks`, `GET /v1/tasks`, `GET /v1/tasks/:id`, reply/cancel/resolve/reopen/report). Use those task identities in the native OpenDuet Tasks port; do not use session envelopes as fake tasks. The service does not yet include Up Next, Bot assignment, full reports or task-specific push. Previous request for basic task CRUD is now partly resolved, while `ChatScreen` home/channel APIs remain a separate fidelity gate.

## Next milestone (strict sequence)

1. On Mac, `git fetch origin`; inspect branch/worktree `git status` and preserve all uncommitted changes. Fast-forward or reconcile the remote feature branch without losing Mac edits. Read `AGENTS.md`, `docs/DECISIONS.md`, `docs/NOW.md`; follow Superpowers TDD and code review.
2. Build source and regression tests using real Xcode Debug/Release and iOS XCTest. Repair all compiler errors and confirm independent Tabs/Modal on device; verify stale surface update and relaunch behavior. Report commands and test counts.
3. Resolve spike package (pin `Package.resolved` transitive SHA), run `swift test` on Mac, execute identical OpenDuet v0.9 source fixtures against EUPHORIA, candidate and pinned JS renderer. Test relative bindings, update upserts, array reorder identity, actions/functions, malicious/failing messages, multiple surfaces and delete/recreate. Compare actual output, not just component counts. Do not delete current renderer before the replacement passes.
4. If conformance and recovery pass, integrate candidate using a small adapter **only** inside Agent B's native files. Native `SurfaceModel` stays disposable projection; gateway surface revisions, permissions, receipts, SwiftData snapshots and action idempotency remain authoritative. Keep archived legacy SwiftData archives readable. If gates fail, document exact failure and retain the original renderer.
5. Coordinate Agent A's source-equivalent Bot/channel/Tasks contracts (see handoff). Port OpenDuet's original `ChatScreen` home and real Task overlays first, not a new dashboard. Next implement genuine Make/PageSheet, galleries, bots and memory with source fixture and backend effect evidence. Keep open GenUI in existing isolated WKWebView, without JS-native bridge expansion.
6. Update the six-proof route ledger as acceptance is demonstrated. Every feature needs source screen trace, actual interaction, data, failures/permissions, relaunch/restore and authenticated effects. No apparent UI parity by fixture-only buttons.

## Definition of done for next checkpoint

All old SwiftData archives load; real native build/test; no two Tabs/Modal instances share presentation; source A2UI event context stays exact; duplicate/replayed actions cannot execute; provider uncertainty stays uncertain; source Tasks remain real tasks; GenUI sandbox unchanged; branch pushed only, not merged.
