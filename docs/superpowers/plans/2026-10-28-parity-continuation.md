# OpenDuet parity continuation implementation plan

> Execute inline with Superpowers executing-plans and TDD; fresh final review. User asks to finish remaining features, not only one deferred issue. Work against the full source inventory, do not claim a fixture is full parity.

**Goal:** Close approval-note durability, conversation/history/cancel, remaining authored gallery and isolated generated-artifact gaps through the existing native/gateway boundary.
**Spec:** docs/ios/FEATURE_PARITY.md and docs/agents/NATIVE_VISUAL_PARITY.md; native SwiftUI shell + isolated generated web artifacts explicitly approved by the user2026-10-28.
**Constraints:** No provider key in app. No fake tool implementations, empty dashboards or standalone product runtime. Preserve canonical SwiftData and SQLite journals. Production identity, external integrations, hosted computer and real provider validation still require configured services. Do not silently drop those requirements from phase one.
**Review focus:** draft isolation across decision/revision; messages after lost response; owner-scoped history and cancellation; read-only display receipts vs human decisions; web artifact isolation/network/native-access restrictions.

### Task1: Approval-note persistence
- [x] RED portable tests for local note drafts/restoration, node/revision isolation, pending/resolved locks and malformed note rejection; add on-disk SwiftData proof.
- [x] Store notes in existing revision-scoped VisualState.values with setField draft operations. Bind shared renderer to that state; use stored value for decision payload. No new store or local view draft.
- [x] GREEN core and native checks; update explicit deferred status.

### Task2: Conversation continuation/history/cancel
- [x] Read official Agents item/input/cancel contracts and OpenDuet source history. Write HTTP/provider tests first.
- [x] Add owner-scoped durable message journal and item normalization/pagination, continuation and cancel endpoints with existing idempotency/recovery rules. Preserve unavailable vs empty state.
- [x] Add typed native client/model/history/session selection using existing archive. Test transports and re-entry; no automatic replay of uncertain messages.

### Task3: Authored gallery + generated artifacts
- [x] Translate source record/metrics/notice/table/bar/pie/line/area/progress schemas into the shared native protocol, validation and renderer. Verify sorting, empty/negative data and stable identity.
- [x] Permit source read-only result surfaces without forcing invented questions; valid display receipts continue the provider once. Persist/reopen through the same state pipeline.
- [x] Add isolated WKWebView only for generated artifacts: fresh data store, no native bridge/secrets, enforced CSP/no network by default, navigation/permission restrictions and testable policy. User explicitly approved this content exception; shell/standard widgets remain SwiftUI.

### Task4: Verify and preserve remaining scope
- [x] Portable/gateway/native tests and Debug/Release builds; fresh independent review with regression fixes. Manual request/choice accepted; expanded complete native gallery trace remains unverified due unreliable input automation.
- [x] Update full parity ledger per actual evidence. Keep backend/integration/admin/computer gaps explicit; finish all feasible independent work rather than claiming those from empty UI.
- [x] Focused local commits, no merge/push. Record actual blocks and single next step.
