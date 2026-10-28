# Current state — 2026-10-28

EUPHORIA branch `feature/agents-native-visual-contract-spike`, implementation `aa12d31` after57e2961. Main unchanged. Backend workstream only; no ios edits/native executor. Previous goal turn was progress; full OpenDuet services/laptop-independent product goal remains active and unfinished.

## Task execution service

Actual owned task creation starts provider work through existing session creation journal. Task metadata joins creations for session identity; no copied run state or parallel executor. Get/list/report/reply/cancel/resolve/reopen routes are implemented. Status derives from canonical pending decisions, actual root provider turn, exact saved assistant reply, existing input receipts and human resolution checkpoint. Idle/subagent completion is not success. Accepted followup supersedes resolution and old completed reply cannot count as new work. Native generic session messages for task sessions use same reply journal.

Reports read owner-scoped safe history and accepted exact decision results, with usable cursors for older messages/decisions. Bounded historical search finds saved reply beyond first page; exhausted evidence returns explicit503 rather than false failure. Creation fingerprint conflicts cannot attach or intercept an unrelated normal conversation. Unknown creation/reply effects survive restart and never replay. Source human resolve of failed work is preserved with failure visible; resolved is person disposition, not executor success.

Source inspected: openbot/server/src/openduet/task-store.ts/task-threads.ts/task-report.ts/tasks.ts. Official Agents turns list endpoint inspected; AgentsClient.listTurns now implements it. Hosted provider turns replace local OpenDuet queue only for this slice. Source retry, Up next suggestions, bot assignment, attachments/skills, rich report synthesis and autonomous schedules remain unimplemented.

Executed **138 gateway tests passed**, no failures/skips. Actual local HTTP/disk SQLite, transport serialization and provider fixtures; no paid calls/key reads, no real-provider task acceptance, no native task UI acceptance. Prior71 Swift core/25 iOS/Debug/Release evidence is historical; no new native build claim. Terra/medium independent review: creation alias/history window/pagination fixed RED→GREEN; source resolve semantics retained with explicit ruling. Evidence:/private/tmp/euphoria-tasks-{red,review-red,collision-red,final}.log.

Code: gateway/tasks.mjs, gateway/gateway.mjs, gateway/conversations.mjs, gateway/agents-client.mjs. Tests: gateway/tests/tasks.test.mjs and agents-client.test.mjs. Versioned native contract/schema/fixture: docs/contracts/tasks-v1.md, tasks-v1.schema.json, fixtures/tasks-v1.json. Existing auth, session SSE (snapshot/history/inputs), locks and journals reused. Task-specific roster push is not implemented.

## Existing graph capability and retained uncertainty

Bounded eight-type A2UI graph admission, shared context validation, revisioned partial operations and exact pending-call fingerprints are implemented. Graph provider envelope v2 includes authoritative revision metadata beside unchanged source userAction. Exact success/refusal result is journalled before delivery. Current graph contracts live under docs/contracts/a2ui-graph*. Real-provider/native graph acceptance remains open.

Historical local journal:1 accepted,1 refused,1 refusal_uncertain with no old stage/status evidence. Cannot reclassify old outcome or replay it. No diagnostics retrofit is proof of past delivery. Real gateway remains stopped; no paid calls used.

**Single next step:** implement source-backed scheduled task firing and durable background continuation on these same task/session journals, with offline clock/restart/idempotency tests. Preserve real-provider/native acceptance as a separate open gate.

Remaining full scope: complete task/retry/Up next/bots; schedules/routines/responsibilities; memory provenance/review/edit/delete; bots/handoffs/skills/scoped grants; channels/groups/media/attachments; external OAuth/MCP/integrations/permissions/audit; rich pages/artifacts and full A2UI catalog/streaming/deletion; hosted browser/computer/files; production identity/managed hosting/webhooks/APNs/background/rate/spend/privacy/retention/deletion/rollback; complete source/provider/native/physical-device acceptance. No endpoint or green fixture substitutes for these requirements.
