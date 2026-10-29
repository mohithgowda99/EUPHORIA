# EUPHORIA | SECTION 2 ENGINEERING HANDOFF
Date: 2026-10-29
Branch: `feature/phase1-section2-autonomous-bots` (isolated remote branch, no merge).
Source baseline: `feature/phase1-section1-openai-completion-20261029` at `a3e92acf50408f8b82c171dcf3fa7a09b9ae9cac`.
Draft review PR: https://github.com/mohithgowda99/EUPHORIA/pull/1 (DRAFT, not merge-ready).

## Status: PARTIALLY IMPLEMENTED, SECTION 2 NOT ACCEPTED

**Do not describe the scheduled-Bot/iPhone-closed acceptance scenario as passing.**
Source and UI integration, owner-bound provider mappings, recovery cursors, human questions and source approval notification routing, real native APNs transport and token registration, one-time scheduling reservation, and offline test fixtures have been added. Existing original OpenDuet RoutineStore, Delivery Inbox/outbox, WorkQueue, ProactiveStore, TaskStore and approval paths remain the only source product authorities. No new scheduling worker, agent runner or credential vault was introduced.

**Hard external execution-correlation limitation:** Published OpenAI `AutomationInvocation` provides `id`, `automation_id`, `session_id`, `source`, `status`, timestamps, skip/error, but NO `turn_id` or documented invocation-to-root execution identifier. The API explicitly describes `completed` as delivery, not agent-work completion:
- https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/automations/subresources/invocations/methods/retrieve
- https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/automations/subresources/invocations/methods/list

The strict `managed-automation-identity.ts` inspector excludes fabricated roots, including undocumented `turn_id` values and latest-turn inference. `managed-routine-bridge.ts` records delivered invocations as **`executionStatus=unverified`**; delivery failures/skips can be closed as delivery failures/skips only. A signed session webhook is an inspection hint, not terminal execution evidence. **Scheduled briefing, scheduled human question and scheduled connector-write attribution cannot yet be executed safely** without an official provider correlation contract or a separately proven root identity. Reusing generic source Inbox turn correlation for an unrelated shared-session schedule is forbidden.

**Hard spending boundary:** OpenAI Agents API rejected per-session `spend_control` on the deployed API observed by Section 1. `verifiedAutomationSpendingBoundary` defaults to an async refusal. Migration, one-time creation, resume, manual invocation, and edits all require it. No `spend_control` bypass, paid recurring inference, live provider calls, production deployment or key change was performed. The loopback-only `managed-development.ts` cannot be treated as a reachable authenticated multi-tenant iPhone backend.

## Changes, by acceptance objective

### Provider identity, original routine ownership
- `gateway/agents-client.mjs`: published Automations create/list/retrieve/update/pause/resume/delete and manual/list/retrieve invocation transport; corrected update body to omit the create-only `type` discriminator.
- `openbot/server/src/routines/managed-automation-identity.ts`: validated delivery identity and documented no-root status, fail-closed cursor advancement.
- `openbot/server/src/routines/managed-routine-bridge.ts`: managed creation/ownership and uncertain-POST repair; exact original owner/Bot/channel/session checks; transactional source routine cutover; durable pagination and deduped provider invocation/source run ledger; pending-receipt reread, strict root unverified.
- `openbot/server/src/routines/store.ts`: original local due/clock/manual/reaper excludes provider-owned and uncertain rows.
- `openbot/server/src/routines/routes.ts`: original owner-scoped source list/history/actions, managed CRUD/repair/inspection; human-approved one-time creation `POST /api/routines/managed/once`.
- One-time creation reserves a unique original `routines` row with `cron='@once'` and executionBackend `provisioning` BEFORE provider POST. It shares `routine-cap-<owner>` advisory lock and the original 20-routine cap, stores a stable ID from owner+requestId, freezes unknown results and never repeats a provider write. The original sweeper never invokes it. A provider-approved one-time date can be edited via managed edit with `runAt`.
- **Not complete:** provider-origin *Bot-created* schedules must remain blocked until the original human has explicitly approved the exact proposed schedule and a trusted request identity is attached; no model-authored automation may silently infer consent. One-time `@once` is a special provider record, not source cron.

### Fair restart recovery and webhooks
- Additive migrations `0074_managed_routine_ownership.sql`, `0075_managed_automation_recovery_cursor.sql`, Drizzle snapshot `meta/0075_snapshot.json`, journal. Existing rows remain `source`.
- Per-routine `providerInvocationCursor` and `providerLastScannedAt`; each pass reads up to 30 list entries + 10 older unverified receipts. Replayed pages are deduplicated transactionally. Original recovery tick sorts managed routines by least-recently scanned state across restarts.
- Signed webhooks are verified on raw payload, receipt-key deduplicated and queued for bounded owner/session-filtered provider reread using `routineCursor`, `inspectedAt`. The webhook **never** authorizes source writes or marks work finished.
- **Remaining**: inspect under concurrent CI/workers and real provider pagination order; provider paging can age out old records, so unobserved history must remain unverified. On a read failure, source must never replay paid work.

### Human approvals and notification delivery
- Existing `managed-development.ts` already maps *authoritatively correlated source Inbox turns* to original `person.question` and connector-write approval work items; this continuation additionally calls original `router.notify(scope,...)` after durable question/approval offer, with stable provider call ID for dedupe. Original source approval must be granted once before consequential write. These are source Inbox turns only; **NOT uncorrelated scheduled invocations**.
- `openbot/server/src/delivery/apns.ts`: real HTTP/2 Apple Push Notification service with ES256 .p8 JWT, sandbox/production endpoint, alert payloads and APNs accepted/failed result. Never claims device display or invents APNs receipt.
- Original `delivery/router.ts` and `delivery/routes.ts`: native APNs transport option, original outbox/WorkQueue, token registration bound to authenticated owner and configured project, invalid-token revocation, optional provider receipt.
- `ios/EuphoriaApp/EuphoriaApp.swift`: APNs delegate + explicit permission/token callback and server registration through saved authenticated account; notification tap opens original approval/chat UI.
- `ios/EuphoriaApp/SourceMoreView.swift`: user-facing enable-native-notifications action with factual status.
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`, `SourceRoutinesView.swift`: original source routine/managed receipt state, one-time selection/schedule, pause/resume/edit/reconcile and native status views. No local scheduler.
- APNs credentials are NOT added to iOS or committed. The server needs `EUPHORIA_APNS_ENABLED=1`, `EUPHORIA_PUSH_PROJECT_ID` (UUID), `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, `APNS_AUTH_KEY_P8_BASE64`, `APNS_ENVIRONMENT=sandbox|production`. A physical signed iPhone build, correct push entitlement and a **public authenticated backend** are required for genuine locked-phone push validation. No APNs 200 or on-device notification observed yet.

### ProactiveStore and tasks
- Existing `managed-task-adapter.ts` already uses the **original** `createProactiveStore` and `createTaskStore`, supports source suggestion list/dismiss/start with idempotent, owner-scoped transactional suggestion-to-task and original TaskThreads. No duplicate store.
- **Not complete:** managed cloud-proactive *read-only discovery generation* and proactive periodic execution are NOT wired to the production multi-user original `ProactiveEngine`; do not claim proactive autonomy or a background check-in works. The provider root/budget boundaries remain hard prerequisites.

## Verified offline CI evidence (code HEAD `95c0e244ea92c9924bc6a80e924a935d77ed64f5`, 2026-10-29)

**EUPHORIA core branch gates: PASS**, [GitHub Actions run 40832853447](https://github.com/mohithgowda99/EUPHORIA/actions/runs/40832853447), job `123310783271`.
- TypeScript server typecheck: PASS.
- Strict automation identity + signed webhook/APNs tests: **9 passed, 0 failed**, two files.
- Managed source unit suite: **21 passed, 0 failed**, nine files.
- Disposable PostgreSQL migration applied per isolated suite, each success.
- Original source integration suites: managed person questions **3**, tasks **1**, connected MCP **2**, completed JSONB **1**, hosted capabilities **1**, cancellation **1**, browser **1**, original RoutineStore source/managed scheduler exclusivity and run context **55**, all PASS. Aggregate **65** DB integration tests.
- Gateway `npm test`: **199 passed, 0 failed**.
- **294 tests passed in this workflow, 0 failed** (9 + 21 + 65 + 199).
- Security/zizmor: PASS on [run 40832853529](https://github.com/mohithgowda99/EUPHORIA/actions/runs/40832853529).

**Repository-wide CI is not fully green.** The format check and migrations pass; the `format, lint, types` job reports Biome lint failures on existing managed-agent modules, including useTemplate style, unused identifiers, and control-character regexp warnings. That is an **outstanding code-quality validation issue, not a missing credential or provider limitation**. Source CI also has other jobs whose results must be inspected individually; passing the Section 2 core gate does not mean every repository workflow passed.

No Xcode/iPhone build, APNs device delivery, live OpenAI Agents inference, real scheduled invocation, authorized connector write, public backend, restart/concurrent-provider stress scenario or production deployment was executed. New unit and integration coverage does **not** constitute the closed-iPhone acceptance test.

## Tests and validation
GitHub draft PR was opened to execute existing CI and the isolated EUPHORIA core offline-gates workflow. Written fixture:
- `openbot/server/tests/managed-automation-identity.test.ts`: no delivery=execution, wrong automation/session denial, manual provenance, pagination errors, APNs signer/no receipt.
- Existing `gateway/tests/agents-automations.test.mjs`, `server/tests/managed-routine-webhook.test.ts` and original routine-store integration tests cover provider request, signed webhook tamper/replay and source/managed scheduler exclusivity.
- Workflow `.github/workflows/euphoria-core-gates.yml`: branch & draft-PR offline typecheck and Postgres fixtures; pinned action SHAs.
- GitHub CI run `40830452969` failed repository format and migration snapshot checks. `40830452991` failed security audit on unpinned existing gate actions; fixed pins afterward.
- A temporary **branch-only**, write-enabled maintenance workflow used the repository's exact Biome formatter and Drizzle snapshot generator to commit `322c1858f5bf6ba5530fd62acacab32d275930f6`. The temporary workflow was then **removed**. These formatting changes may touch additional inherited source files; inspect the diff rather than assume they are feature work.
- Final current-head CI outcomes must be collected before acceptance. Historical earlier passes are not evidence of the latest head. This environment cannot clone the private repo (DNS/network unavailable) or build iOS (no Xcode/macOS). Never claim tests that are only written or checks that are queued as passes.

## Required next validation, explicitly constrained
1. Run `bun install --frozen-lockfile`, `bun run format:check`, `bun run --filter server typecheck`, and latest head CI in isolated checkout.
2. Apply `0074` and `0075` migrations to **disposable** PostgreSQL and test two workers / duplicate webhooks / invocation pages / unknown create and manual POST / revocations / restart scans. Test original source sweeper excludes `managed`, `provisioning`, and `sync_unknown`.
3. On Mac, build the SwiftUI scheme in Xcode for Debug and Release, verify APNs entitlement and permission/re-registration/tap routing.
4. Obtain an official root correlation field or supported alternate provider execution contract for scheduled delivery (not a guessed latest turn). Only then integrate scheduled questions, source briefing and authorized result notification. Also require trusted **provider-side hard spending controls** prior to enabling paid recurring work.
5. Validate actual public Better Auth tenancy, webhooks, APNs credentials, correct notification delivery and approval resume with physical iPhone locked, ONLY after separate deployment/credential/paid-call authorization.

## Non-actions / isolation
No main-branch or Section 1 branch mutation, no branch merge, no Section 3 work, no production database migration, no live paid model requests, no changes to production credentials or uploaded APNs key. Review PR remains **draft**.
