# Tasks service contract v1 — 2026-10-28

Implemented backend vertical slice over existing owned sessions, creation/input/action journals and safe history. Functional source: OpenDuet task-store.ts (status priority, resolution), task-threads.ts (separate task conversation), task-report.ts (derived report). Hosted Agents turns replace OpenDuet's local work queue; no independent task executor or copied run/approval state. This is partial service parity: no bot assignment, Up next suggestions, task attachment/skills, source-rich report synthesis, failed-turn retry, schedules or source task tools yet. No paid/native task acceptance in this batch.

## Requests

All routes require existing verified server principal injected at authentication. Unknown/foreign task is404, including reports/mutations; client owner/bot fields cannot authorize anything. Production identity is not implemented.

- POST /v1/tasks: {id,title,instruction}, exact fields. id uses existing identifier grammar; title trimmed nonempty <=160, instruction trimmed nonempty <=4000. Starts actual provider session through existing create service. Returns201 {task} when session confirmed;202 {task} if uncertain; duplicate request returns200 same task without a new provider write; different payload with same id409. Limit1000 task records per owner.
- GET /v1/tasks?limit=1..20&after=taskID: {tasks,hasMore,nextCursor}, newest first, exclusive owner-scoped cursor. Reads provider evidence for each task; no fake cache status on unavailable provider.
- GET /v1/tasks/:id: {task}.
- POST /v1/tasks/:id/reply: {id,message}; same validation/journal/idempotency as session messages, returns202 {task,operation:{id,phase}}. Generic session message/cancel routes for task sessions transparently use this same path, keeping their original operation response shape.
- POST /v1/tasks/:id/cancel: {id}; actual provider cancel through existing journal,202 {task,operation}. Cancellation receipt is not turn completion.
- POST /v1/tasks/:id/resolve or /reopen: {};200 {task}. Explicit person decision only. Unknown delivery must be reconciled before resolution409; unopened uncertain creation also409.
- GET /v1/tasks/:id/report?historyAfter=itemID&decisionsAfter=actionID: {report:{task,messages,historyHasMore,historyCursor,decisions,decisionsHasMore,decisionsCursor}}. Messages use existing safe history schema, at most10 per page. Decisions are newest50 accepted journal results, with owner/session-scoped exclusive cursor to earlier records. Unaccepted/refusal/unknown/raw provider args never become accepted decisions. Existing legacy accepted actions with NULL result lack exact evidence and are not fabricated.

## Derived state and source semantics

Task fields: id,title,instruction,sessionID(nullable),createdAt,updatedAt,resolvedAt(nullable),deliveryPhase,pendingNodeIDs,failure(nullable),status. No fake channelId/botId until those services exist. Provider session/root turn/history are inspected on read. Each turn must have correct session_id, object agent.session.turn, valid status and root subagent_id=null; completed subagent never stands in for root. Root search pages20 at a time, max10 pages; excessive/invalid/missing cursor evidence explicitly errors.

Status priority matches source: needs_input (current unresolved canonical question/approval/graph); working (provider/session running or waiting, unknown delivery, accepted reply not yet a newer root, or no root yet); resolved (person checkpoint still covers same root/accepted inputs); failed (failed/cancelled root or completed root with no saved reply); ready_for_review (completed root plus nonempty completed assistant reply for that exact turn). Session idle alone never establishes readiness. Reply search scans up to100 safe saved history items; if more pages remain without proof,503 instead of asserting no reply. Native report pagination remains available separately.

A person may explicitly mark failed work done, as in OpenDuet; status resolved means person disposition, not successful execution. Failure remains visible. Marking current work done does not stop the provider; working/needs_input takes priority until it ends. New accepted reply or new root turn supersedes resolution. Reopen only changes disposition, never starts/repeats execution.

## Persistence, streams and recovery

Existing SQLite gets tasks metadata table; task sessionID is joined from existing creations, never separately copied. Creation linkage validates exact instruction fingerprint; colliding/unrelated request409 cannot capture normal conversation routing. Additive inputs.base_turn_id records provider root observed before task reply, preventing a previous completed answer from becoming a false new result. All task/session mutation and provider observation uses existing session lock.

Intent persists before provider calls. Existing creation uncertainty remains blocked; duplicate task request does not retry unknown create. Existing reply/cancel journal survives process restart, prevents duplicate keys and never blindly repeats unknown effects. Definite rejection is not accepted new work. No source queue's automatic retry is claimed: hosted unknown effects require stronger provider reconciliation.

Live detail uses existing /v1/sessions/:sessionID/events SSE (event:update, data:{snapshot,history,inputs}); no task event runtime or source routing clone. Roster metadata/status is refreshed via task GET; task-specific push is not implemented. Server keeps protected ownership/task/instruction/journal metadata; privacy deletion/retention remains an explicit later service requirement. No MacBook independence or production deployment claim.

Schemas: tasks-v1.schema.json; synthetic fixture fixtures/tasks-v1.json. Node tests exercise actual HTTP/disk SQLite and injected provider calls, not fake runtime success. Official provider turn contract: https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/turns/methods/list .
