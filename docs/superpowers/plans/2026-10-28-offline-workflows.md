# Offline workflows implementation plan

> Use Superpowers executing-plans inline and TDD; one fresh final reviewer, one regression fix pass.

**Goal:** Correct failure certainty and expose persistent work through usable native navigation.
**Architecture:** Same provider adapter, action journal, owned sessions, native model/archive and renderer. No new store or dependency.
**Spec:** ../specs/2026-10-28-offline-workflows-design.md
**Tech:** Node/SQLite, Swift core and SwiftUI/SwiftData.

## Review focus
No paid calls; historical uncertain effects never retried. No raw upstream message/secret forwarding. Cursor authorization and no page truncation. Same exact selected session/drafts; no second model. Idle is not successful completion. Offline roster errors must not pretend there are no records.

### Task1 — Sanitized failure certainty
Files gateway/agents-client.mjs, gateway/gateway.mjs, provider/gateway tests.
- [x] RED tests: failed pending lookup/no POST; definite4xx; network/5xx/408/response-decode uncertainty; sanitized persisted refusal data/restart/no retries, historical uncertainty preserved.
- [x] Add fixed stage classification and sanitize journal diagnostics; safe envelope guidance; GREEN gateway suite.
### Task2 — Owned work pagination
Files gateway/gateway.mjs; GatewayClient.swift/ConversationState.swift; gateway/core tests.
- [x] RED tests: >50 work records, page order/no duplicates/termination, invalid limits/foreign cursors; native page decoding and URL cursor transport.
- [x] Implement existing GET sessions pagination with bounds and native client/model paging, explicit roster error/loading state.
### Task3 — Native browser and re-entry
Files new WorkListView.swift; ContentView.swift; GatewaySessionView/Model; Xcode project; native tests.
- [x] RED model tests for paging failure preserving records and shared selected archive/drafts/creation protection.
- [x] Extract shared Debug connection configuration; reuse injected model in existing detail; show work browser first, with New/Resume/Open/search/load-more and Development tools.
- [x] Gateway/core/Debug/Release/iOS gates and no-inference native fixture QA. Independent review and regression fixes.
- [x] Update NOW/parity/evidence with unchanged live-negative boundary; commit/push feature branch. No full phase-one claim.

## Executed evidence
84 gateway/51 core/24 iOS XCTest pass; Debug/Release/plist gates pass. Fresh Terra/medium review identified offline re-entry clearing cached surfaces, inconsistent certainty metadata, and mixed uncertainty guidance. Each reproduced RED; one fix pass preserves cached drafts before refresh, accepts definite rejection only for verified submission4xx except408, and prioritizes unresolved writes in diagnostics. The focused failing native test completed with2 expected assertion failures but its xcodebuild collector hung; owned executor was stopped before the full final gate, which passed normally.

No paid provider/API-key calls in this batch. Live negative session remains uncertain. Disposable local fixture QA verified Tasks list, opening training, automatic choice→form, back-list status refresh and opening a different task with distinct state. Production accounts and full task lifecycle remain missing. User requested newer A2UI branch integration after this batch; source branch inspection follows the checkpoint commit.
