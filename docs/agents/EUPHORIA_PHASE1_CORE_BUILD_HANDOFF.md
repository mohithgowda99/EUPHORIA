# EUPHORIA | PHASE 1 CORE BUILD HANDOFF
2026-10-29 | **NOT a finished/validated Phase 1 product**

## Source identity and safety

- Dedicated remote branch: `feature/phase1-core-continuation-20261029`.
- Baseline (complete descendant of the laptop integration): `fix/native-completed-choice-lifecycle` at `98c71ddbc3187e4d22f47409a2a674b3a4cd7e7f`.
- Preserved earlier laptop branch: `codex/managed-native-execution` at `7f94d2e61eb3226dee3fffc8490b94a61ac34527`.
- **Source changes through implementation commit `d5d306e85e3b70ea908dac50a6f0439d1bb61d51`.** This handoff itself is committed afterward; retrieve exact checkout HEAD with `git rev-parse HEAD` and keep that SHA in test evidence. No main merge was made.
- Repository: https://github.com/mohithgowda99/EUPHORIA.
- No paid OpenAI API requests were authorized or made in this continuation. Previously granted one-off uncapped permission expired. Do not enable `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY=1`.
- GitHub connector was used to commit directly to this dedicated remote branch. The execution environment cannot `git clone` via shell (GitHub DNS blocked), has no Bun/PostgreSQL/Xcode and cannot run original project suites. **All new tests are written but unexecuted; migration 0071 is unexecuted.** Mac builds, real provider, hosted deployment and iPhone proof remain unverified.

## Precise workstream matrix

| Workstream | Implemented on this continuation | Tested offline here | Needs Mac validation | Needs credentials | Not completed |
| --- | --- | --- | --- | --- | --- |
| A Durable human interaction | Exact pending-function recheck; preserves accepted source decision on provider closure, source-bound recovery status and native recovery message; no automatic second result; generic repair wording; regression definitions | **No**; tests committed only | Bun/Postgres race/restart fixtures, multi-device native, long clock advances | Bounded live Agents key for separate eventual verification | Original `person.question` and approval service integration; hours-late pending and expired-action *authorized new-turn* continuation; cancelled-task/revocation/full concurrency matrix |
| B Production backend | JSONB original-source mapper; additive 0071 normalization and disposable-Postgres test | **No** | Typecheck; clone DB migration; restart checks | OAuth/HTTPS hosting/Postgres; bounded OpenAI access | Original production `index.ts` cutover, Better Auth managed routes, deployed process, durable replica workers/webhooks/APNs/cost quota |
| C Bots, Tasks, tools and connections | Inherited source-backed development Bot/channel/session Chat and original source receipts, **no new production feature** | **No** | Existing source/gateway regression suites | Scoped test MCP/read-only and controlled writable integration credentials | Functional production TaskStore/reports/routines, per-Bot MCP grants, tool permission/approval, OAuth connections, editable memory integration, managed automation and tool audit |
| D Full native A2UI | Inherited native choice and completed-choice receipt; source correction no longer has hardcoded workout content; read-only recovery decode/test | **No** | SwiftPM + community comparison + Xcode Debug/Release/XCTest | Bounded provider authorization for real A2UI flow | Community engine not adopted in shipping app, full upstream catalog/bindings/templates/streaming/partials/actions, Make/artifact parity |

Do not report `177 gateway/33 source/5 DB/76 core/39 iOS` historical baseline counts as passes on this new branch. See `docs/agents/2026-10-29-managed-native-handoff.md` for actual prior Mac logs and the single limited provider journey.

## What changed, and why

**Changed**
- `openbot/server/src/db/schema/managed-agents.ts`: `completedOutput` now uses the **original** `./json` Bun-safe JSONB mapper instead of `drizzle-orm/pg-core`'s double-serializing mapper. No new database.
- `openbot/server/src/agents/managed-development.ts`: stricter exact current `required_actions` verification before source-queued decision submission; when closed, keep the source work receipt unresolved with an explanatory `lastError`; show scoped `decisionRecoveryRequired` only for an actual human action and the newest Inbox/root/session; one generic bounded correction, no workout-specific repair.
- `openbot/server/tests/managed-development.integration.test.ts`: offline fixture for closed provider action after accepted answer, restart/no duplicate POST, original decision retention and recovery UI; generic correction assertion.
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`: optional `decisionRecoveryRequired` in source-backed visual envelope; backward-compatible decoding.
- `ios/EuphoriaApp/SourceConversationsView.swift`: explicit native status for saved response requiring authorized new provider continuation rather than endless Thinking.
- `ios/EuphoriaTests/SourceOpenDuetTests.swift`: recovery-envelope and historical-envelope decoding test.
- `docs/NOW.md`: current truthful status.

**Added**
- `openbot/server/drizzle/0071_managed_completed_jsonb_normalization.sql`: in-place normalization of JSONB string values to JSONB objects; refuses unsupported scalar values, preserves IDs and rows. Must run only after backup and disposable test.
- `openbot/server/tests/managed-completed-jsonb.integration.test.ts`: isolated PostgreSQL temporary-table test using the **same shipped SQL**, preserving old and new projections and exercising idempotence.
- Migration `0071` registered in `openbot/server/drizzle/meta/_journal.json`.

**Retired:** none. Production CopilotKit Intelligence remains **unreplaced**, not a silent production cutover. All original source services, migrations, SwiftData records, and historical receipts remain in place.

**OpenAI-managed pieces inherited, not newly deployed:** Agents API sessions and provider SSE/root turn correlation, hosted `AgentsClient` session/turn/tool-result transport. Development assembly uses native `euphoria_render_surface` function tool and source-original `DeliveryStore`/`WorkQueue`/`AgentProfileStore`/`ChannelStore`/managed session-link and Inbox receipts. No live MCP/automations/hosted computer/vault/tool grants configured. The existing `gateway` transport is the compatibility adapter; do not create a competing orchestration runtime. Original approvals and Tasks remain the target source authority.

## Laptop checkout and dependency install

Use a **new worktree**, never a writable checkout shared with the current laptop agent:

```bash
cd /Users/mohithgowda/EUPHORIA
git status --short
git fetch origin --prune
git worktree add ../EUPHORIA-PHASE1-CORE -b validation/phase1-core-local origin/feature/phase1-core-continuation-20261029
cd ../EUPHORIA-PHASE1-CORE
git rev-parse HEAD
git log --oneline -12
git diff 98c71ddbc3187e4d22f47409a2a674b3a4cd7e7f..HEAD --stat
# Node >=24 for gateway, Bun 1.4.x for original source.
npm ci --prefix gateway --ignore-scripts
cd openbot
bun install --frozen-lockfile
cd ..
```

If the worktree/branch already exists, inspect it and preserve all changes rather than recreating it. Never clean, reset or migrate the existing `euphoria_live` database.

## SQL migration: backup, disposable clone, proof, rollback

From a database administrator shell, **secrets must be injected via environment or protected secret manager**, never pasted into tracked files:

```bash
# DATABASE_URL points to source DB; never echo it or commit credentials.
umask 077
pg_dump --format=custom --no-owner --file=/private/tmp/euphoria-before-0071.dump "$DATABASE_URL"
# A DB administrator creates a completely separate target named euphoria_validation_0071.
# Configure TEST_DATABASE_URL to that disposable target, restore there only.
pg_restore --no-owner --no-privileges --dbname="$TEST_DATABASE_URL" /private/tmp/euphoria-before-0071.dump
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c   "SELECT jsonb_typeof(completed_output) AS shape, count(*) FROM managed_agent_inbox_turns GROUP BY 1;"
cd openbot
TEST_DATABASE_URL="$TEST_DATABASE_URL" bun test   server/tests/managed-completed-jsonb.integration.test.ts   server/tests/managed-development.integration.test.ts
# Only on that disposable clone, run the repository's guarded journal migrator:
cd server
DATABASE_URL="$TEST_DATABASE_URL" bun scripts/migrate.ts
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c   "SELECT jsonb_typeof(completed_output), count(*) FROM managed_agent_inbox_turns GROUP BY 1;"
```

Verify exact journal/hash reachability, row counts and historically saved answers/selectedLabels. Stop if invalid JSON strings, unknown scalar types, migration-reach conflict, or any missing completed surface. A production migration may run **only** after a backup and written disposable-DB result. DO NOT rewrite 0070: the journal uses SQL-file hashes and timestamp reach checks. Rollback: stop writers, restore the `pg_dump` backup to a *new database*, validate receipts, then repoint service; do not casually decrement Drizzle journals or overwrite the live source DB. Source mapper change alone does not transform existing SQL rows.

## Commands for offline tests and source checks

```bash
# Run from checkout root; no API credentials needed.
cd gateway && npm test && cd ..
cd openbot
bun run --filter server typecheck
bun run typecheck:tests
bun test server/tests/managed-development.integration.test.ts
bun test server/tests/managed-completed-jsonb.integration.test.ts
# Broader original source and source/approval/task/security regressions:
bun test server/tests
cd ../ios/VisualRuntimeCore && swift test
cd ../Spikes/A2UIRendererComparison
swift package resolve
swift test
```

The source PostgreSQL tests skip without a real disposable `TEST_DATABASE_URL`; a skipped test is **not** a passing integration proof. Gateway Node requires >=24; Bun source requires its locked packages. Run original source CI checks (`cd openbot && bun run format:check && bun run lint && bun run typecheck`) and repair errors. Never use the active laptop euphoria_live for provider fixtures.

## Source development startup and environment

Original development loopback route, **not production**:

```bash
# From checkout root, with secrets placed in ignored gateway/.env
DATABASE_URL="$TEST_DATABASE_URL" \
  bun --env-file=gateway/.env openbot/server/src/agents/managed-development.ts
# Binds 127.0.0.1:8788, only allows the development token.
```

Variables the dev entrypoint reads: `DATABASE_URL`, `OPENAI_API_KEY`, `EUPHORIA_DEV_TOKEN` (at least 32 characters), `EUPHORIA_MODEL` (default `gpt-6-luna`), `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY` (**must remain unset**), `NODE_ENV` (development only). The iOS Debug override uses `EUPHORIA_SOURCE_ORIGIN=http://127.0.0.1:8788` plus `EUPHORIA_SOURCE_TOKEN`. The server expects cookie `euphoria-development=<token>`; release **does not** allow this override. Only the backend has `OPENAI_API_KEY`. Never embed it in Swift, Xcode schemes, screenshots, Git logs or an app binary.

**Cost blocker:** In the actual prior live account, `spend_control` was rejected as an unknown parameter. Normal `AgentsClient` has a bounded limit; keep it. Do not drop it to make a paid request succeed, use an unspecified alternative account or run uncapped. Test with zero-cost fixtures first. Live inference, MCP writes, hosted browser/computer and automations require fresh explicit permission, resource bounds and credentials.

## Native project and Mac-specific acceptance

- Xcode: `ios/Euphoria.xcodeproj`.
- App scheme: `Euphoria`; iOS deployment SDK: iOS 27.
- Native XCTest target: `EuphoriaTests`.
- Historical bundle identifier: `dev.euphoria.ios`, verify from the actual target settings.
- Native app is SwiftUI; only isolated generated artifacts may use WKWebView. No web app shell.
- Exact existing validation script:

```bash
xcrun simctl list devices available
export EUPHORIA_SIMULATOR_ID="<installed-iOS-27-simulator-UDID>"
bash ios/scripts/verify-xcode.sh
# Or direct non-signing simulator build:
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
  -configuration Debug -destination "platform=iOS Simulator,id=$EUPHORIA_SIMULATOR_ID" \
  CODE_SIGNING_ALLOWED=NO test
```

Script checks actual built ATS Info.plists, both configurations, XCTest zero failures/skips, and retains ignored `.xcresult` under `ios/.build-logs`. It does not prove touch accuracy, source auth, restore after iOS kill, cross-device updates or the live model. For simulator install use `xcrun simctl install booted ios/.build-logs/DerivedData/Build/Products/Debug-iphonesimulator/Euphoria.app` then `xcrun simctl launch booted dev.euphoria.ios` after checking the bundle ID. **Physical iPhone** requires an Apple development team, signing, valid app provisioning, actual HTTPS backend, and Xcode's Run on a connected device; loopback `127.0.0.1` on the Mac is not a hardware-device backend.

## Manual journeys and required evidence

A. Existing real choice: open original-source conversation, send a natural request for a choice, select it, verify the saved WorkQueue action/label, exactly one managed `tool_result`, final assistant reply; kill app and reopen on another run without model inference. Confirm completed interface is read-only and appears between its initiating user message and final assistant reply.

B. Closed provider action (offline fixture first): queue a decision while `required_actions` contains the exact `call_id`; let provider action close **before** worker response; reopen backend/app. Assert same owner/turn/source request, one source work item, zero remote result POSTs, honest recovery state. A newly started later source turn must not inherit the old error. Simulate duplicate HTTP submissions and conflicting options.

C. Original approvals/questions: end-to-end source `person.question`/response and approval, cross-user identity, cancellation, permission changes, multi-device and late-answer tests **NOT IMPLEMENTED**. Do not call A complete until the source service and managed continuation work.

D. Production: configure real Better Auth users and a managed-mode original production server **NOT IMPLEMENTED**; no production staging endpoint can be claimed.

E. Tools/tasks: original TaskStore, approval-gated read/write MCP, credential revocation, automation invocation to actual completed report **NOT IMPLEMENTED**. Never expose unrestricted write-capable managed MCP just to demo access.

F. Full A2UI: the library spike at `ios/Spikes/A2UIRendererComparison` references `BBC6BAE9/a2ui-swift` pinned `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0`. Install and test Swift package, compare against original OpenDuet pinned source/web renderer (`@copilotkit/a2ui-renderer@1.77.0`). Test settings form, nested trip, task review, incremental bound dashboard, approval, identity-preserving dynamic list reorder and read-only history. **Not integrated into shipping renderer**. Check security boundaries before adopting; existing spike only validates selected cases. Do not claim full protocol parity.

## Engineering continuation, no new architecture

1. **Run tests and correct new branch regressions first**. Prior integration branch and fixes are preserved via this descendant branch.
2. Finish A: create original-source `person.question` from managed function or approval intent, persist exact provider correlation, route through original `createApprovalQuestions` and original policy, display native pending, accept one owner-scoped answer, submit only exact still-pending required action; prove hour-late and concurrency. If action has expired, preserve answer, validate whether a separate **new authorized turn** can be safely started, and explicitly mark it as new. Avoid replay on unknown external effects.
3. Finish B by changing **actual original** `openbot/server/src/index.ts` composition. Use existing `createRequireUser(auth,roleRepository)` from `auth/guards.ts`, original Hono, Better Auth, original DB, `createDeliveryRouter`, `createManagedSessionLinkStore` and original scheduled queues. Remove dependency on `CopilotKitIntelligence` **for EUPHORIA managed execution** without copying dev entrypoint into a second production server. Refuse unauthenticated/cross-tenant records; add HTTPS and proper background deployment. No source-user dev token in prod.
4. Finish C on original source product stores: `openduet/task-store.ts`, `approvals/questions.ts`, `plugins/tools.ts`, `memory/store.ts`, `routines/store.ts` and original connection service. Managed MCP must have pre-effect permissions and audit, otherwise restrict to read-only. Provider session history is not editable personal memory. Do not retire original routine runner until migration and equivalence.
5. Finish D after comparing the pinned community engine and original source A2UI fixtures: adapt existing source visual contract, preserve SwiftData, server-side action validation, owner identity and no arbitrary native function privileges. Generate general-purpose interfaces; keep HTML artifacts isolated.
6. Then full journeys A-H from the mission, native second-device, credential-bound and separately approved live-provider tests. Record status/receipts, not just test totals. Only then declare ready to deploy.

## Provider and hosted-deployment caveats

No hosting vendor, production URL, OAuth client, Apple APNs signing material, OpenAI vault or external connection credentials were present in this execution environment. As of this handoff there is **no deployment-ready managed production server**, so inventing commands that claim to deploy it would be misleading. Use supported low-cost HTTPS hosting + managed PostgreSQL only after production source composition and auth passes. OpenAI API key must be injected as a server-side secret, never committed; account ChatGPT connections do not automatically transfer to EUPHORIA.

Provider documentation to recheck at implementation time:
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/docs/guides/agents-api/sessions/automations
- https://developers.openai.com/api/docs/guides/agents-api/tools/mcp
- https://github.com/BBC6BAE9/a2ui-swift

## Definition of done

No product-complete claim until actual original-source production server runs without CopilotKit Intelligence, two real authenticated users are isolated, durable late human input has bounded provider continuation, allowed read + approved write tools are audited, Tasks/routines are source-owned and functional, full native A2UI is integrated and restore-safe, cost controls are effective, and real simulator/device receipts are produced.

**This continuation implements a limited correctness patch and tests, not those outstanding gates.**
