# A2UI boolean and selection bindings implementation plan

> Execute inline with Superpowers executing-plans/TDD and one fresh final review.

**Goal:** Native source-equivalent boolean/single/multiple choice binding through existing form operations.
**Architecture:** Typed bounded wire lists + typed initialValue; source adapter and native/gateway validation share semantics; same renderer/store/journal.
**Tech:** SwiftUI, SwiftData, Swift core, Node/AJV/SQLite.
**Spec:** ../specs/2026-10-28-a2ui-choice-bindings-design.md

## Constraints and review focus

No new runtime/dependency/store. Preserve old string/scalar archives and ordinary form behavior. Preserve false/empty arrays, stable option values distinct from labels, multiple-selection order. Reject forged types/membership/cardinality, duplicate/oversized choices, stale or locked edits and unsupported source properties. Test re-entry and exact serialized tool output.

### Task1 — Typed source/gateway contract
- [x] Add source-backed mixed-control fixture and failing adapter/validation/HTTP event tests.
- [x] Extend existing schema/adapter/validator with boolean and bounded string arrays; single/multiple mode and stable labelled options. Existing text fixture stays unchanged.
- [x] Verify output types, invalid input no effect and existing owner/revision/idempotency tests.

### Task2 — Native controls and persistence
- [x] Add failing typed defaults/edits/serialization/reopen/locking/revision-isolation tests.
- [x] Extend existing values/fields/state and native renderer; no alternate event path. Reuse existing fixture entry with mixed controls.
- [x] Verify on-disk SwiftData reopen and all core/gateway/Debug/Release/iOS checks; local review and fixture identity regression fix.
- [ ] Complete fresh independent review: attempted Terra/medium reviewer hit service usage limit; not credited as completed.
- [x] Update current context/evidence/parity, commit and push the verified continuation to the feature branch.
