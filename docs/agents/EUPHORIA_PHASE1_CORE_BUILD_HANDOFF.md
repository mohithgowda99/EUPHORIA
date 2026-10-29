# EUPHORIA Phase 1 core non-production implementation handoff
Date: 2026-10-29

## Scope / branch and verified outcome
**Current implementation branch:** `feature/phase1-core-e2e-convergence-20261029`
**Source head before handoff update:** `637f37ee3e9e12f2f6589fb9075b0abdbc0bd3ed`.
For the final immutable revision run `git rev-parse HEAD` after fetching. This file is committed after that prior head.
Based on `feature/phase1-interactions-tools-a2ui-20261029`, itself based on continuation `aed235fd4ae6fb13c7bd4d511700a83f556652f8`; it includes completed-choice fixes `98c71dd` and inherited JSONB normalization. No merge to main, force push, worktree overwrite or paid inference.

**Verification:** GitHub Actions offline workflow [run 40817090772](https://github.com/mohithgowda99/EUPHORIA/actions/runs/40817090772) completed successfully on SHA `4413dcf399a897cbb9ed2695f961e7b8e4a80b4f`, running original-server Bun typecheck, isolated disposable migrated PostgreSQL for each question/task/MCP/JSONB integration suite, connector/memory tests, and gateway npm regressions. Five later commits only changed user-facing SwiftUI product-copy strings; therefore native code remains uncompiled and a Mac check remains mandatory. Check the latest branch Actions run after this handoff for a final fresh CI result.

**Product scope:** User explicitly excluded the production backend cutover for this pass. Everything described is wired into the original-source **development** assembly. The production server still uses CopilotKit Intelligence and is not converted or deployed. This is not yet full OpenDuet parity or a verified running iPhone.

| Workstream | Implemented | Tested offline | Needs Mac | Needs credentials | Not completed |
|---|---|---|---|---|---|
| A durable questions/approvals | Source-owned persistent questions, one-winner decisions, current provider action check, restart restoration, explicit manually authorized new-turn recovery for expired **ordinary** questions, native recovery, pre-effect MCP write choices | YES: deterministic source+Postgres question lifecycle and expired recovery, connector write decision | Native Approvals, restart/background and read-only history | Live provider late-answer test, separately budget-approved | Real-provider long-wait/timeout, managed auto-resume, cross-device real identity |
| C Bots/Tasks/MCP/memory | Source Bot profiles, TaskStore, Up Next, replies, report projection, memory CRUD and bounded review-scoped context, original PluginStore/vault/routes opt-in, currently-granted inventory, MCP read and user-approved write through source policy/audit | YES: fixture Bot/Tasks/dedup/restoration, grants/refusals, controlled read/write fixture with DB | Native Bots, Task, Connections, Memory screens on Simulator/device | Actual MCP server credentials + optional broker/OAuth + bounded live agent permission | Hosted tools/subagents/managed scheduling, real OAuth + external read/write acceptance, native push, per-user production auth |
| D native A2UI | Pinned `a2ui-swift` exact revision in Xcode app, native `SurfaceViewModel`, two-way editor changes stored via source `VisualState`, authenticated source submit route, historic surface restoration | Gateway A2UI unit regressions run offline; NO native Swift tests here | **Required**: package resolve, compile, unit tests, Simulator gestures and restoration | Real-agent generated interface requires explicit API spend approval | Full 18-component upstream parity (original source graph still restrictive), expressions/dynamic templates/multi-surface streaming, full live UI acceptance |

**Do not promote a tested fixture to a live provider / iPhone pass.** Do not run `OPENAI_API_KEY` inference without separate explicit authorization and a compatible hard cap.

## Functional integration
A: `openbot/server/src/agents/managed-person-questions.ts` defines strict managed function/question call+scope correlation. `managed-development.ts` registers this tool next to the existing render tool, persists a durable original `person.question` keyed by exact call ID, and handles original `person.response` work items on the original queue. The worker projects pending human questions even when the iPhone is closed; its lookup is scoped by original Inbox ID and exact root turn. It only submits against the matching *current* provider required action. A closed/changed action preserves the answer and exposes explicit recovery; it does not fabricate tool results or automatically send a new paid turn. An uncertain remote acknowledgment never triggers an automatic second submission. A closed ordinary question exposes an explicit, authenticated, idempotent `POST /api/approvals/recovery/:id/continue` action; it queues a **new** source Inbox turn only if the user presses the native recovery control. Connector write approvals and uncertain provider outcomes are never replayed via this route.

C: `openbot/server/src/agents/managed-task-adapter.ts` is an adapter, **not** another runner or task state store. It uses original TaskStore, TaskThreads, ChannelStore, DeliveryStore, TaskIntake and ProactiveStore. Source task status checks original `delivery_inbox` (realm `managed-task`), with no shadow status column. Source task report reads original source Inbox and managed completed projections; unknown assistant completion time is left null. Proactive suggestion Start uses an atomic original DB transaction to claim the card and create one original task/channel. Managed source actor and Bot access remain enforced. Native task reply external ID is deduplicated on the original delivery ledger. Original source MemoryStore is mounted for editable provenance/confirm/disable/delete, with bounded approved Bot-scoped memory context, without Intelligence memory mirroring; unavailable connector ingestion is explicitly unavailable rather than presented as active.

C tools: `managed-connected-mcp.ts` provides bounded source-granted tool inventory and exact pending-provider-call correlation. Source `PluginStore` remains the executor, policy/credential revocation gate and auditor. `managed-development.ts` exposes `euphoria_connected_mcp` only when original `PluginStore` is configured, persists read executions on original WorkQueue, and creates original `person.question` write decisions showing exact arguments. Native Approvals presents explicit **Allow once / Refuse**. The worker rechecks original scope and grants immediately before a permitted effect and does not replay uncertain provider acknowledgments. Fixture coverage is real; connected vendor credentials / live acceptance are not.

D: `ios/Euphoria.xcodeproj` now includes native SwiftUI upstream renderer `A2UISwiftCore` and `A2UISwiftUI` with exact revision pin. `EuphoriaNativeA2UIEngineView.swift` uses `A2UIProjectionBridge` from the existing spike to rebuild validated display surfaces from saved `A2UIDocument`. `VisualNodesView.swift` dispatches source display-only compositions to it, leaving action-bearing forms on their existing persisted and authenticated local submission route. Do **not** claim full A2UI until value binding, edits, identity and actions are reconciled end to end against the original gateway and tested.

D native continuation: `EuphoriaNativeA2UIEngineView.swift` now listens to upstream `SurfaceViewModel` bindings and passes typed edited values to the original source `VisualState` / `compositionSubmissionValues`. `VisualNodesView.swift` uses this renderer for supported `sourceComposition` components, not a new in-memory user-action authority. The original source graph validator still accepts a subset of upstream protocol; treat full A2UI as **not completed** and reject unsupported components safely.

## Files changed
Added:
- `openbot/server/src/agents/managed-person-questions.ts`
- `openbot/server/src/agents/managed-task-adapter.ts`
- `openbot/server/src/agents/managed-memory-context.ts`
- `openbot/server/src/agents/managed-connected-mcp.ts`
- `openbot/server/tests/managed-person-questions.integration.test.ts`
- `openbot/server/tests/managed-source-tasks.integration.test.ts`
- `openbot/server/tests/managed-memory-context.test.ts`
- `openbot/server/tests/managed-connected-mcp.test.ts`
- `openbot/server/tests/managed-source-mcp.integration.test.ts`
- `.github/workflows/euphoria-core-gates.yml`
- `ios/EuphoriaApp/EuphoriaNativeA2UIEngineView.swift`

Modified:
- `openbot/server/src/agents/managed-development.ts`
- `openbot/server/src/openduet/task-store.ts`
- `openbot/server/src/memory/routes.ts`
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`
- `ios/EuphoriaApp/SourceApprovalsView.swift`
- `ios/EuphoriaApp/SourceBotsView.swift`
- `ios/EuphoriaApp/SourceTasksView.swift`
- `ios/EuphoriaApp/SourceConnectionsView.swift`
- `ios/EuphoriaApp/SourceMemoryView.swift`
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
  origin/feature/phase1-core-e2e-convergence-20261029
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

Use a **disposable** PostgreSQL database with the `vector` extension. Prefer the exact isolated suite workflow at `.github/workflows/euphoria-core-gates.yml` (source questions, Tasks, MCP and JSONB each receive a distinct database so the single dev actor's Inbox cannot leak across provider fixtures).
```bash
cd openbot
bun run --filter server typecheck
bun run typecheck:tests
bun test server/tests/managed-connected-mcp.test.ts server/tests/managed-memory-context.test.ts
# Set TEST_DATABASE_URL to a freshly migrated disposable database, never live:
DATABASE_URL="$TEST_DATABASE_URL" bun server/scripts/migrate.ts
bun test server/tests/managed-person-questions.integration.test.ts
# Run Task, MCP and JSONB suites against separate fresh migrated disposable DBs:
bun test server/tests/managed-source-tasks.integration.test.ts
bun test server/tests/managed-source-mcp.integration.test.ts
bun test server/tests/managed-completed-jsonb.integration.test.ts
cd ..
npm --prefix gateway ci
npm --prefix gateway test
```
To rerun exact complete Linux gates use GitHub Actions `EUPHORIA core branch gates` on this branch. The latest completed green source/backend run is linked above. Historical older laptop counts are not proof of current native acceptance.

## Dev backend only
Use existing ignored `gateway/.env` without printing or committing it. Required names: `DATABASE_URL` (PostgreSQL), `OPENAI_API_KEY` (server only), `EUPHORIA_DEV_TOKEN` (>=32 chars). Optional: `EUPHORIA_MODEL`, `EUPHORIA_ENABLE_SOURCE_MCP=1`, `KEY_ENCRYPTION_KEY` (32 secure random bytes encoded base64, required when MCP enabled), and `OPENBOT_BROKER_PROVIDER` where supported. The original encrypted PluginStore/vault and provider are activated only by explicit flag; no connection is inferred from ChatGPT account. Do not print or commit the encryption key. Other OAuth/vendor credentials remain unconfigured.
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
2. Mock provider with no matching required action. Verify original response retained and recovery UI appears, with **zero** remote submission or fake completion. Use the native explicit recovery control to enqueue a new source turn only for an expired ordinary question. Verify duplicate recovery POST returns one immutable original Inbox. Connector write/unknown submissions must still refuse replay.
3. Create Task, restart backend, confirm original task ID, own Bot/Channel, accepted Inbox and status from real receipt. Post the same `messageId` twice; one `delivery_inbox` reply. Up Next saves/states, Start claims at most once. Native report shows only source-backed content.
4. Create, edit, confirm, disable and delete original MemoryStore entries; prove deletion/forgetting and ownership. Run `bun test server/tests/managed-memory-context.test.ts` and inspect that unreviewed, disabled, deleted and other-Bot memories never enter the provider instruction prefix. Connector-based source sync must report unavailability.
5. Compare simple and nested display A2UI documents against source spike; perform fresh package resolve/build, incremental rebuild, expired/invalid surfaces, SwiftUI identity. Verify interactive fields use the pinned native engine but persist edited values through original `VisualState`, and that native taps route through `compositionSubmissionValues`/original authenticated gateway. Validate the full source graph subset and historical record reopening.
6. Run older accepted Leg day and completed choice read-only relaunch regression. Inspect tap coordinates and history order. No paid API calls for this stage.
7. Only after a **separate explicit budget approval**: one bounded live provider question; one bounded native tool action, only when all permission gates are actually wired. No speculative comparisons or uncapped inference.

## Known failures and next engineering tasks, prioritized
- **Native mandatory**: macOS/Xcode has not compiled `EuphoriaNativeA2UIEngineView.swift` since moving the pinned engine from display-only to two-way input submission. Resolve exact upstream SwiftPM package, Xcode Debug/Release XCTest, source fixtures, Simulator and real device before declaring installed.
- **A**: Offline ordinary human questions and expired explicit user-driven new turn are proven. Real OpenAI provider long-wait and multi-device authentication require separately authorized acceptance; no automatic replay on unknown remote acknowledgment.
- **C**: Real source PluginStore MCP call path exists and fixture approved write/read passed offline. Vendor OAuth, authenticated external read/write, managed hosted environment/subagent delegation, managed automation integration, push notifications, broad tool discovery/retrieval and production per-user auth remain undone. Unapproved real write must not run.
- **D**: Original source `a2uiGraph` validation still supports a narrower safe subset than the upstream 18-component catalog. Expression evaluation, dynamic templates, richer Lists/Tabs/Modals, multi-surface/streaming operation replay and complete end-to-end native input acceptance remain undone. Unsupported controls must fail closed, never become inert interactive buttons.
- **B excluded**: Original production composition still uses CopilotKit Intelligence; Better Auth production cutover, deployment and hosted hosting credentials are not performed.
- **Cost**: Previously deployed provider rejected `spend_control`; do not use removed one-off uncapped authorization. Offline fixtures are safe and current; paid real-provider calls are blocked until an explicit bounded budget and compatible enforcement are approved.

## Recovery / rollback
Keep `main`, `codex/managed-native-execution`, `fix/native-completed-choice-lifecycle`, and `feature/phase1-core-continuation-20261029` intact. To abandon this experimental branch, return to old integration/fix branch; DO NOT force push or delete saved Inbox, question, answer, completion projection, Bot or task data. Inherited migration 0071 requires dump/backup of actual DB and **disposable clone proof** before being applied to a live database; it normalizes legacy double-serialized JSONB and fails safely on unsupported shapes. Do not use down migrations that drop completed projections. Source human response work items intentionally preserve uncertain/closed provider outcomes for manual reconciliation rather than automatic resubmission.
