# EUPHORIA | SECTION 2 AUTONOMOUS BOTS ENGINEERING HANDOFF
Date: 2026-10-29
Branch: `feature/phase1-section2-autonomous-bots`
Source baseline: `feature/phase1-section1-openai-completion-20261029`, commit `a3e92acf50408f8b82c171dcf3fa7a09b9ae9cac`.
Implementation checkpoint before this document: `489febad51393110438f81fff0a4e1ec99233b88`.
Final branch HEAD is the newer commit containing this document; inspect with `git rev-parse HEAD`.

## Executive status

**PARTIAL. DO NOT CLAIM SECTION 2 ACCEPTANCE.**

The provider transport, source routine ownership cutover, signed-webhook receipt boundary, bounded invocation inspection and native controls are implemented as **unvalidated code** on this isolated branch. Original OpenDuet remains owner of routines, Bots, channels, run history, source Delivery Inbox, WorkQueue, person approvals, tasks, proactive suggestions and source connector grants. OpenAI remains owner of the cloud schedule and agent execution. No duplicate local scheduler, general-purpose agent runner, second task store or new credential vault has been added.

**Hard stop: no enforceable provider-side per-recurring-invocation budget has been established.** The current provider rejected `spend_control`, and managed routine creation/resumption/manual invocation/edits refuse execution unless a trusted `verifiedAutomationSpendingBoundary` is provided to the server-side development factory. The CLI entrypoint DOES NOT supply this callback; an environment variable cannot silently bypass it. No paid live provider calls were made.

**Hard stop: full root-turn correlation is unproven.** Public Automations invocation records document delivery status and session ID, but do not guarantee a root turn ID. The current reader will not mark a scheduled run succeeded without an exact session, root turn, terminal provider status and nonempty assistant output. This intentionally makes uncorrelated invocations stay **unverified**. A webhook indicating `agent.session.idle` or a completed invocation is not work completion.

## Exact modifications

- `gateway/agents-client.mjs`: create/list/retrieve/update/pause/resume/delete, manual invocation, list/retrieve invocation transport. Existing-session and typed new-session targets; recurring five-field cron + IANA zone, one-time Unix `run_at`; conservative frequency checks. No automatic replay on uncertain network responses.
- `gateway/tests/agents-automations.test.mjs`: offline request-path, target normalization, input validation, failure and idempotency fixtures.
- `openbot/server/src/db/schema/coworker.ts`: additive `executionBackend` (`source`, `provisioning`, `managed`, `sync_unknown`), provider ID/sync intent fields, small invocation and webhook identity receipt tables.
- `openbot/server/drizzle/0074_managed_routine_ownership.sql` and `openbot/server/drizzle/meta/_journal.json`: additive migration and journal. Existing routines default to `source`; they are not migrated or disabled implicitly. Unique provider automation ID, unique provider invocation ID and event receipt PK.
- `openbot/server/src/routines/store.ts`: the source due-scan, clock CAS, firing eligibility, manual-run transaction, reaper and unschedulable transition exclude managed/uncertain backends. Shares original manual-run advisory lock with migration, closing manual-run/cutover race. Original RoutineStore owns all original run rows.
- `openbot/server/src/routines/managed-routine-bridge.ts`: explicit original-owner and live source-channel/Bot/session checks; guarded migration, pause/resume, edit, delete and manual invocation; original run receipt correlation; unique, bounded read-only invocation/turn reconciliation and source-channel reply projection; conservative ambiguity repair. Provider POST failures never automatically re-fire original routines. Duplicate or ambiguous manual invocations cannot generate a second original run. Lost provider `create` replies can be reconciled by exhaustive, bounded search for exact `EUPHORIA:<routine-id>` name in the saved session.
- `openbot/server/src/routines/managed-automation-webhook.ts`: Standard Webhooks `whsec_` raw-body HMAC verification, five-minute clock skew, duplicate identity keys, strict supported session event types and bounded payload size.
- `openbot/server/src/routines/routes.ts`: original `/api/routines` now reports the source execution backend and raw cron (for owner-authorized native edit); owner-scoped managed migrate/pause/resume/edit/delete/manual/reconcile/repair/state methods. Legacy routes remain source-authoritative; conversational create/update remains in original builtin routine tools.
- `openbot/server/src/agents/managed-development.ts`: mounts original RoutineStore and managed bridge in the existing loopback development assembly, with explicit default-deny spending callback. Signed webhook route only if server has `OPENAI_WEBHOOK_SECRET`; inserts deduplicated receipt, never interprets event as finished work. Bounded 60-second read-only recovery poll scans at most ten managed routines per pass and thirty recent invocations each.
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`: typed original routine backend, provider receipts, managed actions, edit, repair, original status and history transport.
- `ios/EuphoriaApp/SourceRoutinesView.swift`: native SwiftUI source routine list, provider-versus-execution distinction, provider receipt and original run-history inspection, explicit migration and destructive-action confirmations, pause/resume/edit/manual run/reconciliation/repair. Real backend responses only; no simulated timers or inferred completion.
- `openbot/server/tests/managed-routine-webhook.test.ts`: offline signed raw-body fixture, tampering/replay/unknown-event denial.
- `openbot/server/tests/routines-store.integration.test.ts`: added database regression fixtures excluding provider-owned/provisioning/uncertain routines from original source firing.

## Migration and operational contract

1. Apply migration `0074_managed_routine_ownership.sql` with the existing OpenDuet migrator in a disposable database. Do not run against a production database in Section 2.
2. Existing `source` rows remain governed by original RoutineStore sweeps and original conversational routine tools. Provider mapping is always an explicit user operation with an exact source owner, Bot, channel and existing managed session.
3. Before remote creation, a single original transaction changes `source -> provisioning`, stores the stable operation key and disables source firing. On positive provider ID acknowledgement, it becomes `managed` with the provider automation/session binding. An unknown response remains frozen and must be inspected through `/managed/repair`; **never automatically reenable the source scheduler**.
4. Before any managed mutation, a database claim moves `managed -> sync_unknown` with the original operation key. Only confirmed provider success settles it back to `managed`. Recovery can verify exact matching create/pause/resume/delete state; ambiguous edits remain blocked rather than replayed.
5. A manual run reserves one `routine_runs` row and one provider-receipt mapping atomically before provider POST. An uncertain manual POST must not be repeated under a new key.
6. A scheduled provider invocation creates an original run only once, deduplicated by provider invocation ID. Delivery `completed` is not execution success. Completion requires the **exact authoritative root turn**, saved provider items, no pending human action, nonempty output and a fresh source authorization check. Only then does `channels.recordActivity` publish a stable-source-ID reply and the original run close. Source notifications and generated files are not assumed to have been delivered by APNs.
7. Webhook receipt IDs are deduplicated. Webhooks only prompt source/provider reading. No arbitrary provider payload is treated as authorization, a task, or a completion event.
8. Stop, edits and deletion affect future invocations, not necessarily work already delivered to a provider session. In-flight cancellation and approvals remain Section 1's original human-action pathways; do not infer them from schedule controls.
9. The `GET /api/routines/:id/managed/state` endpoint is owner-scoped and returns receipt statuses only. Native UI must distinguish `deliveryStatus`, `executionStatus`, original `routine_runs` outcomes and source waiting approvals.

## Capability and evidence matrix

| Capability | Implemented in source | Offline verified here | Live verified | Blocked |
|---|---|---|---|---|
| OpenAI periodic/once Automations transport | Yes | Fixtures written, **not executed** | No | Hard spending boundary |
| Original RoutineStore owner/backends/no source double fire | Yes | PostgreSQL fixtures written, **not executed** | No | Migration/typecheck pending |
| Managed routine migrate/pause/resume/edit/delete/manual/repair | Guarded code | Not executed | No | Hard budget, uncertain provider mutations |
| Provider invocation receipt and restart-safe read inspection | Partial | Not executed | No | Exact invocation-to-root mapping missing |
| Signed session webhook and dedup | Code + fixtures | Not executed | No | Webhook secret, public endpoint and delivery test |
| Native schedules, controls and history | SwiftUI code | Xcode **not run** | No | Backend/live connection and UX acceptance |
| Original source replies | Only after confirmed provider root | Not executed | No | Root correlation and deployment |
| Original notifications to native iPhone | No APNs path wired | No | No | APNs credentials, native token registration and transport |
| Original source Tasks, ProactiveStore, MCP grants and approvals | Reused from baseline | Section 1 tests separate | No | Autonomous suggestion-to-routine and schedules tool grants not complete |
| One-time routine through original `RoutineStore` | No; provider transport supports once | No | No | Original store remains cron-only |
| Agent-created Automations tool with current owner grant | **Deliberately disabled** | No | No | Must enforce original Bot grants, limits and spending cap on every schedule |
| Multiuser production autonomous deployment | No | No | No | Better Auth production seam explicitly excluded |

## Known defects, release gates and next authorized engineering work

1. **Mandatory provider budget:** resolve the rejected `spend_control` against the deployed Agents API and find a provider-enforced or independently provable hard spend constraint for unattended recurring inference. Do not set `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY=1` as a workaround. Do not create automation resources until explicit spending authorization.
2. **Exact root correlation:** the documented automation invocation has `session_id`, `status` and `source.type`, not necessarily `turn_id`. Establish an unambiguous invocation-to-session root mapping from authoritative events or source-stamped input. If the API cannot supply this, preserve `unverified` instead of guessing from last session turn or timestamps. Include canceled/blocked/failed per-turn cases.
3. **Source-managed multiuser authentication:** the current `managed-development.ts` is loopback and fixed `DEV_ACTOR`; production `index.ts` uses old Intelligence. Do not deploy or claim multiuser isolation before a separate authorized production cutover.
4. **Native real notifications:** existing `openbot/server/src/delivery/push.ts` is Expo push for OpenBot mobile, not verified APNs for SwiftUI EUPHORIA. Native device token enrollment, APNs signing, Apple entitlements, registration, user preferences, delivery receipts and disabled/quiet hours must be implemented and tested. Source channel activity alone is not a push.
5. **Proactive autonomy and authorized connected tools:** the baseline ProactiveStore/TaskStore and approval UI exist, but no fully validated schedule proposal/acceptance path to managed Routines, and no permissible agent-authored automation tool grant. Continue default deny rather than enabling raw `automations` tools in a hosted session.
6. **One-time original routine ownership:** OpenAI transport supports `once` but the original `RoutineStore` schema/logic is five-field cron; no source-owned one-time routine migration/expiry has been added.
7. **Deleted/paused semantics:** native delete cascades original routine run history by existing schema; archival retention should be separately approved before production. Pausing does not cancel already delivered work. Unknown remote edits are not auto repaired.
8. **A2UI/artifacts:** native run receipts show factual state but scheduled artifacts/results cannot be opened until exact provider-root/Artifact mapping passes source ownership.
9. **No CI or local worktree proof:** GitHub connector created and pushed a **distinct remote branch**, but the editing environment did not have an accessible local Git checkout to construct a literal local worktree. Section 1's checkout and remote branch were never touched. The separate Mac agent should create its own isolated local worktree.

## Reproducible MacBook validation procedure (unexecuted)

```bash
git fetch origin
git worktree add ../EUPHORIA-SECTION2 -b validation/section2 origin/feature/phase1-section2-autonomous-bots
cd ../EUPHORIA-SECTION2
git rev-parse HEAD
git diff a3e92acf50408f8b82c171dcf3fa7a09b9ae9cac..HEAD --stat

# Gateway offline contract tests (Node 24+)
cd gateway
npm ci
npm test
cd ..

# Original source types and tests
cd openbot
bun install --frozen-lockfile
cd server
bun run typecheck
# Use fresh disposable local Postgres, never production data:
# Put DATABASE_URL in ../.env and apply existing migration runner.
bun run db:migrate
bun test tests/managed-routine-webhook.test.ts
bun test tests/routines-store.integration.test.ts
bun test tests/routine-sweep.integration.test.ts
bun test tests/routine-routes.test.ts
cd ../..

# Native simulator build, on macOS with project schemes validated:
xcodebuild -list -project ios/Euphoria.xcodeproj
# Select actual scheme and simulator from preceding output:
# xcodebuild -project ios/Euphoria.xcodeproj -scheme <actual-scheme> \
#   -destination 'platform=iOS Simulator,name=<available simulator>' build
```

Then run manual offline HTTP fixtures with provider stub: owner A creates a routine, duplicate migration attempts, lost provider POST/response, explicit repair, paused/edited/deleted provider state, source-sweep race under two replicas, manual invocation idempotency, source user B denial, invalid webhook signature/replay and process restart. Verify `routine_runs` IDs, provider mappings, `source`-backend exclusion and owner revocation in the database.

**Only after** explicit paid-provider approval and a verified hard budget boundary: create an actual weekday `0 8 * * MON-FRI` `Asia/Kolkata` automation using a read-only Bot with one approved source connector, let the provider deliver an invocation with the iPhone app closed, inspect the original session and exact root turn, verify source-owned result, required human approval for consequential write, APNs receipt and live pause/resume/edit/delete/manual semantics. Do NOT claim passage unless genuine API IDs, source run IDs, webhook receipts, original channel output and physical-device push receipts are retained in the acceptance evidence.

## Section 1 integration note

Baseline `a3e92acf50408f8b82c171dcf3fa7a09b9ae9cac` was taken only from the named Section 1 branch. Section 1's independent validation agent may commit additional source fixes after this point. Do not force-merge or copy their unverified updates. Once independently validated, inspect their exact diffs and rebase/cherry-pick only reviewable relevant commits through a controlled integration branch, then rerun RoutineStore migration, source ownership, managed-session binding, existing MCP approval and iOS tests.

## Acceptance verdict

The reference scenario, “Every weekday at 8 AM in Asia/Kolkata, research authorized sources, save a briefing, notify me and ask before external send,” is **NOT achieved end-to-end**. It has a cloud transport and source-aware safety boundary, but no verified spend-cap-authorized automation, exact managed invocation-to-root completion projection, real native APNs delivery or live phone acceptance. Preserve this honest status for Section 2; do not start Sections 3, 4 or 5.
