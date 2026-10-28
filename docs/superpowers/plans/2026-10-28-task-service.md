# Task service execution plan

Superpowers executing-plans + TDD. Spec ../specs/2026-10-28-task-service.md.
- [x] RED HTTP/disk tests for actual provider session creation, ownership/idempotency/uncertainty and derived lifecycle.
- [x] RED listTurns transport validation and source root/subagent/turn matching cases.
- [x] Implement tasks.mjs over shared db/create/refresh/conversations/lock; additive metadata/input checkpoint only.
- [x] Verify needs_input, reply/cancel, root completion+saved reply, resolve/reopen, followup supersession, report and restart.
- [x] Independent review; one TDD important fix pass; full suite.
- [x] Versioned contracts and fixtures, accurate limits; commit/push. Full service/cloud goal remains active.

Evidence: /private/tmp/euphoria-tasks-red.log; review RED /private/tmp/euphoria-tasks-review-red.log and collision RED /private/tmp/euphoria-tasks-collision-red.log; final137/137 /private/tmp/euphoria-tasks-final.log. Native untouched; no paid calls. Terra/medium review: creation alias/history window/report pagination fixed RED→GREEN; active-session freshness and generic routing collision also covered.

Ruling: retain source allowing explicit human resolution of failed or running work, rather than reviewer-suggested ready-only guard. OpenDuet task-store.ts prioritizes resolved over failed and its setResolved has no ready-only guard; failure stays visible and working/needs_input outranks disposition. Cost if interpreted as executor success: misleading claim; contract and field semantics explicitly distinguish the two.

Remaining full source task scope: retry/Up next/bots/attachments/skills/rich reports/background schedules and live provider/native acceptance. Full service/cloud goal remains active.
