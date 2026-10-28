# Current state — 2026-10-28

EUPHORIA backend branch `feature/agents-native-visual-contract-spike`; implementation `c9b9e4c` following10617b7. Main and AgentB native branch untouched. Previous goal turn was progress. Full backend/service/cloud objective remains active and unfinished.

## Clarified ownership

User supplied AgentB brief: B owns complete native SwiftUI/A2UI/GenUI/product UI in isolated feature/phase1-native-product-ui worktree; A owns gateway/execution/scheduling/services/contracts. Preserve existing native renderer/VisualState/SwiftData; no shared writable checkout, backend clone or uncoordinated native merge. Remote native branch was inspected read-only and remains separate. Versioned backend fixtures are integration surfaces; fixture rendering does not prove live parity.

## Scheduled task dispatch

Owner-scoped routine create/get/list/revisioned edit/delete/run history now fires real existing tasks.start/session creation. Source-pinned cron-parser5.10.0, strict5-field cron/IANA timezone, fixed200-occurrence15min floor and runtime pair backstop,20 enabled cap. Exact source firing frame tells model to perform work. Atomic SQLite due occurrence claim+next stamp precedes provider submission; overlapping sweeps/restart never replay claimed/unknown effects. Windows older10min skip without catchup. Worker heartbeat surfaces never_seen/stale/active; launcher timer requires explicit EUPHORIA_ROUTINES_ENABLED=1, default off.

Independent Terra/medium review3 Important findings fixed with regressions: re-read clock per claim after slow provider call; retain/recover deterministic task link after post-create read failure; stop new claims and drain active background work before closing SQLite (max120sec, unknown effect preserved after timeout). One process per SQLite file is the supported boundary; shared-file replicas are unsafe and must not be deployed.

Executed **148 gateway tests pass**, zero failures/skips. Source clock/HTTP/disk tests include actual framed task-provider fixture dispatch, ownership/CAS edits/caps, lost response/restart, missed windows, slow batch, link restoration, shutdown and timezone/schema fixtures. Initial deferred test stubs/repeated-close cleanup stalled owned baseline runners; their confirmed PIDs were stopped, test cleanup corrected; prior shutdown behavior reproduced explicit RED then finally restored fixed code; full final suite passed. No paid calls/key reads; no native edits/executor/build/live acceptance. Prior Swift/iOS evidence remains historical.

Code: gateway/routines.mjs, gateway/gateway.mjs, gateway/server.mjs and package manifests. Tests: gateway/tests/routines.test.mjs. Contract/schema/fixture: docs/contracts/routines-v1*. Evidence:/private/tmp/euphoria-routines-{red,review-red,shutdown-red,final}.log. Worker is development implementation, not managed hosting. Dispatched means confirmed session creation, not successful requested work.

## Existing task/graph path

Task lifecycle/reporting uses existing owned sessions/creation/input/action journals. Status is derived from canonical decisions, actual root turns and matching saved replies; idle/subagent completion is not success. Explicit human resolve of failed work preserves failure and does not execute anything. Graph admission/shared context/revisioned operations and exact pending fingerprints are implemented; graph provider-only envelope includes revision metadata, exact success/refusal journals before delivery. Versioned task/graph contracts live under docs/contracts. Native/provider acceptance remains open.

Historical refusal_uncertain has no original kind/stage/status evidence; do not reclassify or replay. Real provider gateway remains stopped.

**Single next step:** implement routine outcome reconciliation and source fatigue/notification semantics on actual task evidence, then proceed memory/bot/permission services; retain coordinated real-provider/native acceptance as an explicit gate.

Remaining: source fatigue10-failure disable/first-failure notices/grants/channel continuity/routine model tools; full task retries/Up next/bots/attachments/skills/rich reports; memory provenance/review/edit/delete; bots/handoffs/skills/grants; channels/groups/media/attachments; OAuth/MCP/integrations/permissions/audit; full A2UI catalog/dynamic lifecycle/pages/artifacts; hosted browser/computer/files; production identity/managed hosting/webhooks/APNs/background/rate/spend/privacy/retention/deletion/rollback; complete source/provider/native/device acceptance. Source full routine instruction-length parity is also open (current3500 bound accommodates existing task frame). Full goal is not achieved.
