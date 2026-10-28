# Nested form bindings implementation plan

> Execute inline using Superpowers executing-plans and TDD; one final fresh reviewer.

**Goal:** Support bounded nested object paths through existing native form projections.
**Architecture:** Source packet → bounded model/path normalization → existing canonical field/default/event contract. No client runtime, dependency or parallel state.
**Tech Stack:** Node/SQLite gateway; existing SwiftUI/SwiftData contracts.
**Spec:** ../specs/2026-10-28-nested-form-bindings-design.md

## Constraints and review focus
Absolute safe named paths depth8 only. Model object limits32 per object/128 total entries, depth8; existing leaf bounds. Root/subtree replace, own properties only; no prototype traversal, array indexing, aliases, null or relative/escaped keys. Old valid flat fixtures stay byte-equivalent. Preserve revision/ownership/once-only submissions.

### Task1 — Normalize nested model data
Files: gateway/a2ui-form.mjs; new gateway/a2ui-model.mjs and gateway/tests/a2ui-nested.test.mjs.
- [x] Write failing nested text/boolean/choice defaults and edited event-context tests; root/subtree replacement, missing-parent creation, missing-binding, primitive traversal, prototype/depth/width/total-value bounds tests.
- [x] Run targeted tests RED; implement bounded model path/set/get helper then connect normalization.
- [x] Run all gateway tests GREEN including legacy flat fixtures.
### Task2 — Full-path evidence and setup
Files: gateway/tests/gateway.test.mjs; gateway/README.md; docs/NOW.md and existing parity/evidence/handoff.
- [x] Gateway owner/revision/idempotency/reopen test with nested source packet and typed tool result.
- [x] Run Swift core, Debug/Release/iOS gates; independent review and regression fixes.
- [x] Document safe .env startup and configured test model; probe key presence only, never values. Attempt real native validation only once configured.
- [x] Record actual counts/limits, commit and push existing feature branch. Real-provider absence never becomes full-completion claim.

### Task3 — Live malformed render recovery (measured blocker)
Files: gateway/agents-client.mjs, gateway/gateway.mjs, existing transport/gateway tests.
- [x] RED provider error-wire test and durable bounded refusal/restart/unknown-tool tests.
- [x] Add rejectToolCall(sessionID,{turnID,callID,name,error},submissionKey); verify exact required-action identity, send success:false with error (no output). Journal refusal before sending and cap at3 per turn; no replay/false human action receipts.
- [x] Refresh the same actual Luna session, verify corrected native surface and once-only tool-result continuation. Native evidence remains separate.

## Executed evidence and limits
77 gateway /49 Swift core /20 iOS XCTest pass; Debug/Release/plist gates pass. Fresh Terra/medium review found published→malformed and refused→valid call-identity bypasses. RED regressions reproduced both; one fix pass now checks published fingerprints and refusal journal identity before normalization/publication. Private .env was created by request, key configured by user and kept Git-ignored0600; gpt-6-luna selected.

Real provider journey1: synthetic session created via gateway HTTP; malformed initial payload received a once-only provider error; fresh corrected askChoice streamed to native Simulator; native Staging tap journaled once; real completed response “You chose Staging.” appeared without Refresh; terminate/relaunch restored idle session with locked choice and live connection. Native-created journey2 sent a request successfully but its malformed render refusal became delivery-uncertain. The app eventually surfaced uncertainty, persisted it and did not replay. This negative case blocks full native-journey acceptance. A canonical example now clarifies future session instructions; its effect on model reliability is unmeasured. No full product/79-route parity/external-effect claim.
