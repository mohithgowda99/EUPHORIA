# Current state — 2026-10-28

Project:EUPHORIA. Branch `feature/agents-native-visual-contract-spike`. Backend implementation `7c9d765` plus cancellation acceptance regression in the following context commit. Main unchanged. Full backend objective and phase one remain active and unfinished. Native implementation belongs to the second workstream; no `ios/` changes in this batch.

## Backend graph milestone

Existing render tool now accepts explicit bounded `a2uiGraph` v0.9 operation packets. Eight supported native types, nested/shared bindings, catalog/identity/references/resource bounds, component upserts and revision-checked model subtree updates validate before publication. Existing native/source-form inputs remain compatible. Source graph output uses existing canonical surface/SQLite versions; human submitForm events validate exact button/context/literals/shared paths against saved graph and actual pending call. Existing ownership/session locks/action IDs/journal are reused. No parallel executor/store.

Current implementation distinguishes safe not_sent/rejected/uncertain failures, preserves immutable action payloads, rejects changed pending arguments and never replays unknown effects. Provider event acceptance requires HTTP202; invalid successful statuses stay uncertain. Already-decoded function arguments are bounded before recursive fingerprinting. Independent Terra/medium review found2 important issues; both reproduced RED then fixed.

Executed: **119 gateway tests,71 unchanged Swift core tests**, zero failures/skips; actual HTTP/SQLite plus actual AgentsClient serialization against offline provider transport. Temporary Swift consumer decoded versioned backend fixture, applied shared text/boolean edits, produced exact gateway action and preserved one pending event across Codable reopening. No fresh Simulator/Debug/Release run in this backend-only batch: previous25 iOS/Debug/Release evidence is historical, not a new acceptance claim.

No paid provider calls, no key use, no secret reads. Real-provider graph generation/continuation and coordinated native execution remain unverified. HTTP202 means event accepted, not turn completion or external execution. Real gateway remains stopped.

## Retained uncertainty investigation

Read-only aggregate committed SQLite evidence:1 accepted action,1 refused render,1 refusal_uncertain. The old uncertain row has no saved failure kind/stage/status. Existing evidence cannot prove whether it was never sent, rejected or accepted with a lost response. It remains uncertain and unreplayed; new diagnostics are not retroactive proof. Read-only immutable inspection was used after normal readonly opening failed; no database content modified.

## Contracts and exact changed areas

Implementation: gateway/a2ui-graph.mjs, a2ui-form.mjs, visual-contract.mjs, gateway.mjs, agents-client.mjs, provider-arguments.mjs.
Tests: gateway/tests/a2ui-graph.test.mjs, a2ui-graph-gateway.test.mjs, agents-client.test.mjs; two source-derived graph JSON fixtures.
Versioned coordination: docs/contracts/a2ui-graph-v1.md, a2ui-graph-input-v1.schema.json, a2ui-graph-exchange-v1.schema.json, fixtures/a2ui-graph-v1.json. These include request/publication/action/result/stream/auth/recovery semantics.
Evidence: /private/tmp/euphoria-graph-{red,loop-red,recovery-red,source-red,review-red,bounds-red,schema-red,final-node}.log; /private/tmp/euphoria-backend-graph-core.log; /private/tmp/euphoria-backend-contract-proof.log. Raw evidence/private data not committed.

**Next:** close coordinated real-provider graph acceptance and revision-feedback gaps against the versioned contract, then implement source-backed task lifecycle/execution/report service through the existing owned session and journal. Source task-store/tasks/task-threads/task-report and routines are located under openbot/server/src/openduet and shared; do not substitute ordinary session browsing for completed task parity.

Remaining: full A2UI catalog/streaming/dynamic component removal and deletion/grants/pages; tasks/questions/reports/schedules/routines; memory provenance/edit/delete; bots/handoffs/skills/scoped grants; channels/groups/attachments/integrations/OAuth/MCP/permissions/audit; hosted browser/files/computer execution; production identity/hosting/durable background/webhooks/APNs/rate/spend/privacy/retention/deletion/rollback. Laptop-independent product and full source acceptance are NOT achieved.
