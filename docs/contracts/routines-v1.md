# Routine dispatch contract v1

Implemented schedule-to-existing-task vertical slice; source OpenDuet routines/schedule.ts, routines/sweep.ts and shared/routine-firing.ts. Uses the same pinned cron-parser5.10.0 as source bun.lock. No new model/tool executor. No paid-provider/native routine acceptance in this batch. AgentB owns native screens; this backend branch does not edit ios or merge AgentB's branch.

## API and authorization

Existing owner authentication is required on every route; foreign or unknown routine404. No arbitrary owner field or public all-owner sweep endpoint.
- POST /v1/routines: exact {id,title,instruction,cron,timezone,enabled};201 {routine}. Duplicate same id/input200; conflict409; deleted request IDs cannot be reused. title<=160, instruction<=3500 UTF16 units (bounded so exact source firing frame fits current task4000 limit); enabled boolean. Current source maximum-instruction parity remains a follow-on.
- GET /v1/routines: {routines,worker:{phase,lastSweepAt}}. phase never_seen/stale/active; stale after15min. No worker is implied by stored schedules.
- GET /v1/routines/:id: {routine}.
- PATCH /v1/routines/:id: {expectedRevision,...title/instruction/cron/timezone/enabled}; exact supported fields, positive integer current revision required,409 stale. Changing schedule or re-enabling computes next after current clock.
- DELETE /v1/routines/:id: {expectedRevision}; removes standing routine from active APIs and disables firing; execution records remain for later audit/retention policy. It does not erase prior submitted tasks.
- GET /v1/routines/:id/runs?before=epochMilliseconds: newest50 {runs,hasMore,nextCursor}; entries {dueAt,revision,phase,taskID}. Foreign cursor cannot access another routine because query always scopes routine/owner. Deleted routine's retained journals are not presently exposed by this route; unified audit remains later work.

Routine:{id,title,instruction,cron,timezone,enabled,revision,nextRunAt}. No client Bot/channel grants yet; routines act as their authenticated creator and use only current task-service tools. Model-level routine management tools, per-Bot grants, channels and third-party effects are not implemented or implied.

## Scheduling and dispatch

Strict five-field cron (no seconds/year), IANA timezone, deterministic fixed200-occurrence scan from2024 plus actual next-pair backstop; refuse intervals under15min. Max20 enabled and1000 retained routine records per owner. This uses source's bounded scan caveat: pathological distant DST compression is caught by runtime backstop, not a false exhaustive proof. Invalid schedule at sweep disables it without dispatch.

Trusted in-process server.sweepRoutines considers up to50 due entries. Before each claim it reads current clock, rechecks standing revision/enabled/due and computes next after now. SQLite transaction records unique (routine,due) and advances next_run before any provider call. Missed window older10min is skipped once and next becomes current; no catchup spending. Same minute key persists as request_id in routine_runs, and tasks.start reuses existing creations/session journal.

Source firing frame tells the model this is scheduled work to perform, not a request to create/list routines. Standing instruction stays unchanged in routine metadata; the exact framed input is the task instruction/transcript. Native treatment should identify the source frame, not pretend someone typed it. A firing gets its own owned task session in this slice; source's channel continuity is a remaining difference.

Phase dispatched means provider session creation was confirmed, NEVER that the routine's requested work succeeded. Phase uncertain means dispatch/read/crash evidence cannot prove the whole handoff. Persisted task identity links even after post-create read failure; startup resolves deterministic links without provider retries. Dispatching at restart becomes uncertain; a claimed occurrence is never submitted again automatically. Source run outcome/fatigue rule, first-failure notification,10-failure disable and per-Bot/channel grants remain unimplemented, not marked completed by dispatch acceptance.

## Worker and shutdown

Development launcher enables timer only with explicit EUPHORIA_ROUTINES_ENABLED=1; default off. It invokes same sweep every60sec with no overlapping local timer tick. No credentials or paid inference used in tests. Hosted deployment must keep one gateway/worker process alive; current launcher still loopback development and laptop independence is not achieved.

Gateway supports ONE process owning one SQLite file. In-process owner locks enforce caps/revisions; occurrence CAS also protects overlapping sweeps. This is not distributed/multi-process correctness: do not run replicas against the same file. Multi-process ownership/managed queue/storage qualification belongs to deployment work.

Shutdown stops new sweeps/claims, closes HTTP admission and drains active sweep before closing SQLite (max120sec). If bound expires, persisted submitting/dispatching intents remain uncertain for restart; no replay or false success. Existing provider-request timeouts still apply. Worker heartbeat records start of sweep and surfaces stale if stalled. No task/routine push/SSE roster channel yet: native uses GET and existing task session SSE.

Schemas: routines-v1.schema.json; synthetic native fixture fixtures/routines-v1.json. Evidence includes clock, restart, actual task/provider fixtures, stale slow-batch prevention, task linkage and shutdown drain. Further full source and cloud/provider/native acceptance remain required.
