# EUPHORIA Phase 1 core non-production implementation handoff
Date: 2026-10-29

## Scope / branch
Dedicated remote branch: `feature/phase1-interactions-tools-a2ui-20261029`
Initial handoff base was `0290ec86e5eb631ebe84982a7f83730fffc7a8c4`; follow-up compiler-source repair and bounded Bot memory injection landed afterward. Read the branch's current SHA with `git rev-parse HEAD`.
The handoff commit itself is necessarily newer; read the exact checked-out SHA using `git rev-parse HEAD`.
Based on continuation `aed235fd4ae6fb13c7bd4d511700a83f556652f8`, which incorporates `fix/native-completed-choice-lifecycle` (98c71dd) and the JSONB normalization migration.
Nothing merged to main or reset on the original laptop worktree.

**The user specifically excluded the production backend cutover from this iteration.** That work remains blocked/unimplemented, not secretly moved. This branch is *not* a verified complete or production-ready personal-agent product.

## Workstream truth table
| Area | Implemented in branch | Tested offline in this environment | Needs Mac/Xcode | Needs credentials / authorization | Not completed |
|---|---|---|---|---|---|
| A durable human interaction | Managed `euphoria_ask_person` tool definition; source `person.question` + `person.response` receipts; server-owned polling with exact original Inbox/root; authenticated one-winner answer; exact current provider required-action check; no automatic resend when uncertain; native Approvals + recovery UI | Deterministic test code committed, **not executed** | Native pending/completed/recovery UX, restart and device testing | Separately bounded live provider late-response test | Provider-expired authorized *new turn* fallback; full original write-approval bridge; production-scale worker lease handling |
| C Bots/Tasks/Memory | Existing source Bot profiles/chat remain; original TaskStore/TaskThreads and intake mounted; actual managed Inbox turn for task; original Up Next persisted; source task replies deduplicated by client message ID; source-based report; editable MemoryStore route mounted | Deterministic task test code committed, **not executed** | Native Task create/reply/Up Next/detail and Memory edit/forget | Managed paid model execution test authorized separately | Original MCP/plugin grants/vault/connections tool calls, approved write, cloud scheduling, native push, multi-agent authority and managed memory retrieval |
| D A2UI native | Pinned `a2ui-swift` revision `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0` added to app Xcode project; reused comparison bridge; standard engine renders source-validated display-only compositions; original working action-backed controls preserved | **Not run** | Swift package resolution, app compile, source fixture differential, native screenshots and interaction regression | No paid inference permitted | Full generic server-authorized A2UI action+edited-value bridge, streaming/dynamic-list conformance, interactive full catalog acceptance, all general examples |

Production B excluded at user's direction. No external-effect tools or automation claims made.

## Functional integration
A: `openbot/server/src/agents/managed-person-questions.ts` defines strict managed function/question call+scope correlation. `managed-development.ts` registers this tool next to the existing render tool, persists a durable original `person.question` keyed by exact call ID, and handles original `person.response` work items on the original queue. The worker projects pending human questions even when the iPhone is closed; its lookup is scoped by original Inbox ID and exact root turn. It only submits against the matching *current* provider required action. A closed/changed action preserves the answer and exposes explicit recovery; it does not fabricate tool results or automatically send a new paid turn. An uncertain remote acknowledgment never triggers an automatic second submission. This is intentionally conservative, and does not yet provide new-turn fallback.

C: `openbot/server/src/agents/managed-task-adapter.ts` is an adapter, **not** another runner or task state store. It uses original TaskStore, TaskThreads, ChannelStore, DeliveryStore, TaskIntake and ProactiveStore. Source task status checks original `delivery_inbox` (realm `managed-task`), with no shadow status column. Source task report reads original source Inbox and managed completed projections; unknown assistant completion time is left null. Proactive suggestion Start uses an atomic original DB transaction to claim the card and create one original task/channel. Managed source actor and Bot access remain enforced. Native task reply external ID is deduplicated on the original delivery ledger. Original source MemoryStore is mounted for editable provenance/confirm/disable/delete, with bounded approved Bot-scoped memory context, without Intelligence memory mirroring; unavailable connector ingestion is explicitly unavailable rather than presented as active.

D: `ios/Euphoria.xcodeproj` now includes native SwiftUI upstream renderer `A2UISwiftCore` and `A2UISwiftUI` with exact revision pin. `EuphoriaNativeA2UIEngineView.swift` uses `A2UIProjectionBridge` from the existing spike to rebuild validated display surfaces from saved `A2UIDocument`. `VisualNodesView.swift` dispatches source display-only compositions to it, leaving action-bearing forms on their existing persisted and authenticated local submission route. Do **not** claim full A2UI until value binding, edits, identity and actions are reconciled end to end against the original gateway and tested.

## Files changed
Added:
- `openbot/server/src/agents/managed-person-questions.ts`
- `openbot/server/src/agents/managed-task-adapter.ts`
- `openbot/server/src/agents/managed-memory-context.ts`
- `openbot/server/tests/managed-person-questions.integration.test.ts`
- `openbot/server/tests/managed-source-tasks.integration.test.ts`
- `openbot/server/tests/managed-memory-context.test.ts`
- `ios/EuphoriaApp/EuphoriaNativeA2UIEngineView.swift`

Modified:
- `openbot/server/src/agents/managed-development.ts`
- `openbot/server/src/openduet/task-store.ts`
- `openbot/server/src/memory/routes.ts`
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`
- `ios/EuphoriaApp/SourceApprovalsView.swift`
- `ios/EuphoriaApp/SourceConversationsView.swift`
- `ios/EuphoriaApp/VisualNodesView.swift`
- `ios/Spikes/A2UIRendererComparison/Package.swift`
- `ios/Spikes/A2UIRendererComparison/Sources/A2UIProjectionBridge.swift`
- `ios/Euphoria.xcodeproj/project.pbxproj`

Retired: none. Existing CopilotKit production server has not been modified. No new migrations introduced in this sub-branch; inherited `0071_managed_completed_jsonb_normalization.sql` from the previous continuation.

## Environment/setup (Mac)
```bash
git fetch origin
git worktree add ../EUPHORIA-CORE-VALIDATION -b validate/euphoria-core \
  origin/feature/phase1-interactions-tools-a2ui-20261029
cd ../EUPHORIA-CORE-VALIDATION
git rev-parse HEAD
cd openbot
bun install --frozen-lockfile
bun run --filter server typecheck
cd ../gateway
npm ci
npm test
cd ..
swift test --package-path ios/VisualRuntimeCore
swift test --package-path ios/Spikes/A2UIRendererComparison
```

Before any tests with a database: create a **disposable** isolated PostgreSQL DB with the original migrations through 0071. DO NOT point injected-provider tests at `euphoria_live` or another owner's data.
```bash
export TEST_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:55432/euphoria_core_disposable'
cd openbot
bun test server/tests/managed-person-questions.integration.test.ts \
         server/tests/managed-source-tasks.integration.test.ts \
         server/tests/managed-completed-jsonb.integration.test.ts \\
         server/tests/managed-memory-context.test.ts
bun run --filter server typecheck
cd ..
```
The two new tests and inherited migration test are skipped without `TEST_DATABASE_URL`. Re-run whole original tests after these focused gates:
```bash
cd openbot
bun test
bun run typecheck:tests
cd ..
cd gateway && npm test && cd ..
```
If tests fail, fix on this validation branch and replay the suites. **None of these commands has yet run in the current GitHub-only environment.** The previous laptop's 177 gateway / 33 source / 5 PG / 76 Swift core / 39 XCTest results predate these commits and are not new evidence.

## Dev backend only
Use existing ignored `gateway/.env` without printing or committing it. Required names: `DATABASE_URL` (PostgreSQL), `OPENAI_API_KEY` (server only), `EUPHORIA_DEV_TOKEN` (>=32 chars). Optional: `EUPHORIA_MODEL`. Other API keys and production credentials are not configured by this branch.
```bash
DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:55432/euphoria_dev' \
  bun --env-file=gateway/.env openbot/server/src/agents/managed-development.ts
```
Bind is local `127.0.0.1:8788`. No `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY=1` opt-in; the previous one-time approval expired. The current deployed OpenAI API rejected `spend_control` on session creation; do NOT bypass the bound or run paid calls without a separate explicit authorization and compatible limit. No deployable remote endpoint is claimed.

For a hosted production backend later, use original-source Better Auth/HTTPS/Postgres and replace CopilotKit execution in the real original production entrypoint. That work is deliberately excluded and not implemented here.

## Mac native build/run
Project: `ios/Euphoria.xcodeproj`; shared scheme `Euphoria`; native app target `Euphoria`; iOS bundle `dev.euphoria.ios`.
```bash
xcodebuild -resolvePackageDependencies -project ios/Euphoria.xcodeproj -scheme Euphoria
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
 -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' \
 -derivedDataPath /tmp/euphoria-phase1-core-ddata build test
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
 -configuration Release -destination 'generic/platform=iOS Simulator' \
 -derivedDataPath /tmp/euphoria-phase1-core-release CODE_SIGNING_ALLOWED=NO build
```
For iOS Simulator boot/launch, select a real available UDID from `xcrun simctl list devices available` (prior laptop reported iPhone 18 Pro Max iOS 27). Run `xcrun simctl boot <UDID>`, install the built Debug `Euphoria.app` with `xcrun simctl install <UDID> <path-to-app>`, and launch with `xcrun simctl launch <UDID> dev.euphoria.ios`. In Xcode select the Euphoria scheme, set app signing team and bundle ID for a real iPhone, unlock device, enable Developer Mode, run on device. Real network device routing cannot use localhost of the Mac automatically; configure secure endpoint and ATS correctly instead of exposing dev token over public HTTP.

## Manual acceptance and approval gates
1. In disposable DB create own Bot (original source route); create a source conversation. Have deterministic fixture return `euphoria_ask_person`; stop app/backend; restart; open Approvals on second client; answer; ensure one `person.response` and one provider submission against exact pending call; conflict gets 409.
2. Mock provider with no matching required action. Verify original response retained and recovery UI appears, with **zero** remote submission or fake completion. A future new authorized-turn recovery needs official lifecycle proof and additional implementation.
3. Create Task, restart backend, confirm original task ID, own Bot/Channel, accepted Inbox and status from real receipt. Post the same `messageId` twice; one `delivery_inbox` reply. Up Next saves/states, Start claims at most once. Native report shows only source-backed content.
4. Create, edit, confirm, disable and delete original MemoryStore entries; prove deletion/forgetting and ownership. Run `bun test server/tests/managed-memory-context.test.ts` and inspect that unreviewed, disabled, deleted and other-Bot memories never enter the provider instruction prefix. Connector-based source sync must report unavailability.
5. Compare simple and nested display A2UI documents against source spike; perform fresh package resolve/build, incremental rebuild, expired/invalid surfaces, SwiftUI identity. Interactive forms must retain existing original `VisualNodesView` path and real saved input values.
6. Run older accepted Leg day and completed choice read-only relaunch regression. Inspect tap coordinates and history order. No paid API calls for this stage.
7. Only after a **separate explicit budget approval**: one bounded live provider question; one bounded native tool action, only when all permission gates are actually wired. No speculative comparisons or uncapped inference.

## Known failures and next engineering tasks, prioritized
- **Immediate P0 build verification**: never claim these new TypeScript/Swift changes compile until laptop executes suites. Check imported types/signatures, original test fixture event formats, Hono task route precedence, pinned SwiftPM target linking and `A2UISurfaceView` API.
- **A incomplete**: source question is durable, but expired provider calls do not start a new authorized turn. Full approval service integration and live late-question acceptance remain undone. Uncertain post acknowledgment is kept in an explicit recoverable receipt.
- **C incomplete**: permissions/credentials/MCP/plugin catalog, real authorized read-only connector, pre-effect write approval, revoke in flight, managed hosted execution, Bots delegation, tasks retry/cancel, scheduled autonomy, push, skill grants and semantic memory retrieval remain undone. Source task status and read-only report are useful, not a claim of full product parity.
- **D incomplete**: pinned engine renders validated source **display-only** documents; full open-ended A2UI forms/expressions/action payloads, streaming, deletions, and two-way authoritative state still require integration and source differential fixtures. Existing interactive forms are deliberately preserved rather than being routed through unvalidated protocol actions.
- **B intentionally excluded**: original production server still depends on CopilotKit Intelligence; Better Auth/hosting/deployment untouched.
- **Infrastructure**: no actual hosted deployment, Xcode, Simulator, cross-user production auth, real devices, test DB, or paid calls run here.

## Recovery / rollback
Keep `main`, `codex/managed-native-execution`, `fix/native-completed-choice-lifecycle`, and `feature/phase1-core-continuation-20261029` intact. To abandon this experimental branch, return to old integration/fix branch; DO NOT force push or delete saved Inbox, question, answer, completion projection, Bot or task data. Inherited migration 0071 requires dump/backup of actual DB and **disposable clone proof** before being applied to a live database; it normalizes legacy double-serialized JSONB and fails safely on unsupported shapes. Do not use down migrations that drop completed projections. Source human response work items intentionally preserve uncertain/closed provider outcomes for manual reconciliation rather than automatic resubmission.
