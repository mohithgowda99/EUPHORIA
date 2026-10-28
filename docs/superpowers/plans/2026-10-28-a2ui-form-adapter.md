# A2UI source form adapter implementation plan

> Execute inline using Superpowers executing-plans and TDD; one fresh review at completion.

**Goal:** Reproduce OpenDuet's edited-data A2UI form test using the existing native form and gateway journals.
**Architecture:** Strict source packet normalization to canonical VisualSurface; native initial values and source event descriptor; no new event runtime/store.
**Tech:** SwiftUI/SwiftData, Swift core, Node/AJV/SQLite.
**Spec:** ../specs/2026-10-28-a2ui-form-adapter-design.md

## Constraints and review focus

Native standard controls; isolated web only for artifacts. Preserve ordinary form behavior and v1/v2 archives. Fail unsupported features, missing references, cycles/aliases, unexpected attributes, invalid version/catalog/path. Source events use edited data including empty/whitespace; never grant external execution. Pending/reopened decisions retain exact data and lock correctly.

### Task1 — Gateway source adapter
- [x] Add shared source fixture and failing compile/invalid-input tests against pinned source test.
- [x] Implement strict recognized-tree/model/action normalization; add validated event/default fields to schema and exact tool result translation.
- [x] Connect the existing render function's input union; retain original source fingerprint and gateway-owned identity. Test HTTP owner/revision/idempotency and invalid payload refusal.

### Task2 — Native form semantics and evidence
- [x] Add failing default/edit/reopen/empty/whitespace/locking tests and on-disk source form re-entry proof.
- [x] Extend existing field/node/state/render bindings, no second renderer or persistent store.
- [x] Run gateway/core suites, Debug/Release and iOS XCTest. Fresh review; fix important findings with regressions.
- [x] Update NOW/evidence/parity context, commit and push the verified slice to the same feature branch.
