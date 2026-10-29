# EUPHORIA | FINAL PHASE 1 IMPLEMENTATION HANDOFF

**Status: Partial Phase 1 engineering implementation, NOT a completed, deployable product.**
**Prepared:** 2026-10-29.
**Implementation branch:** `feature/final-phase1-engineering-20261029`.
**Protected baseline:** `feature/phase1-core-e2e-convergence-20261029` at `78f746d2b3f4f3c57861853109bff0290132edca`.
**Latest implementation SHA before this handoff:** `f81bfa24668915d6b7f50e67b78d1672e587a919`.
**Verified full source/backend CI with all current code modules:** `44d9065b3ed695f808841efe14e1aa3a7400505e`, https://github.com/mohithgowda99/EUPHORIA/actions/runs/40819545709 (completed successfully; this does NOT include Xcode/real-provider/production validation).
**Exact final branch HEAD SHA:** execute `git rev-parse HEAD` after fetch; handoff commit itself has its own later SHA. Do not confuse a pre-handoff source commit with branch HEAD.

This document is intentionally an accurate engineering transfer, **not an assertion that the mission's Definition of Done was achieved**. The user explicitly requires code, a production provider cutover, autonomy, full native A2UI, tests and a handoff. Work below is what was actually implemented and verified in this environment, with honest remaining gates.

## 1. Repository and source preservation

Source repository: `mohithgowda99/EUPHORIA`.
No merge into `main`, no force push, no remote production deployment, no credential edits, no paid inference.
The starting convergence branch incorporated original source `DeliveryStore`, `WorkQueue`, `TaskStore`, `MemoryStore`, `PluginStore`, managed session/root identity, original person questions/answers, native historical visuals, a source MCP bridge, and pinned upstream Swift A2UI.
The nine divergent continuation commits were inspected. A meaningful correctness fix from `dd05c914` and `d5d306e8` was selectively incorporated into current `managed-development.ts`: unresolved native choice warnings now require exact current root and session, and a real user action rather than a model render-repair refusal. No blind merge and no replacement of newer source fixes. Existing native `SourceConversationsView` already consumes explicit `decisionRecoveryRequired`, so its parallel recovery UX was retained.

## 2. Changed modules in this branch

| File | Implementation |
| --- | --- |
| `openbot/server/src/agents/managed-native-mcp.ts` (new) | Read-only direct managed MCP configuration, exact original Bot grant intersection, public HTTPS operator origin allowlist, no credentialed/brokered/Shared/destructive tools, bounded counts |
| `openbot/server/src/agents/managed-connected-mcp.ts` | Excludes any direct managed tool refs from duplicate original source MCP bridge/inventory |
| `openbot/server/src/agents/managed-development.ts` | Adds optional managed `web_search` and direct MCP manifest; preserves source-controlled write approvals; restores root-exact native recovery filter |
| `gateway/agents-client.mjs` | Provider Automations create/get/invocations/pause/resume/delete transport and recognized rejected `spend_control` without uncapped fallback |
| `openbot/server/tests/managed-native-mcp.test.ts` (new) | Grant/effect/destructiveness, public origin allowlist, credential/broker refusal, future-manifest revocation |
| `gateway/tests/agents-automations.test.mjs` (new) | Offline HTTP contract and bounded scheduling, invocation reading, uncertain POST |
| `gateway/tests/agents-budget-compat.test.mjs` (new) | Deployed API `spend_control` compatibility refusal with no second POST |
| `ios/EuphoriaApp/OpenDuetSourceAPI.swift` | Real original plugin-server catalogue, connection start/disconnect API, per-Bot grant/revoke helpers, typed source results |
| `ios/EuphoriaApp/SourceConnectionsView.swift` | Native available/connected list, OAuth openURL, confirmation before disconnect, source-ledger reread; broker field credentials explicitly unsupported |
| `ios/EuphoriaApp/SourceBotPermissionsView.swift` | Server-advertised MCP tool toggles, original backend admin gate, live grant reread, separate approval caveat |
| `.github/workflows/euphoria-core-gates.yml` | Final branch CI trigger and native-MCP fixture included |
| `docs/NOW.md` | Truthful current state and blocking gates |
| `docs/agents/EUPHORIA_FINAL_PHASE1_IMPLEMENTATION_HANDOFF.md` | This handoff |

**No new migrations:** inherited source `openbot/server/drizzle/0071_managed_completed_jsonb_normalization.sql` still applies; do not run destructive down migration on real original Inbox/completed JSONB.

## 3. Functionally implemented paths and authoritative services

**Existing convergence baseline:** Original source Bot profile/channels, managed session and source Inbox turn correlation, native conversation and accepted source UI choice, durable source questions and typed original response acceptance, explicit expired-question recovery, original TaskStore/task thread/suggestions, original confirmed MemoryStore context, PluginStore MCP read and approved write, pinned A2UI Swift engine for a subset and historical source visual restoration. Existing deterministic source tests are the only verification claimed, not paid provider proof.

**New this branch:** A managed agent definition MAY carry exact-granted, anonymous native read-only MCP for explicitly approved public HTTPS service origins. EUPHORIA's original MCP executor remains the only path for credentialed writes, sensitive tools, and product-owned approval. An already-created provider session may retain an old native MCP grant; this opt-in path is **not production-approved** until revocation/cancellation of active remote sessions is demonstrated.

New native Connections UI can discover original source servers, obtain authenticated server-issued OAuth start URL, and request source-owned disconnect with subsequent source reread. OAuth redirect is **not** treated as connected. Brokered credential-field forms and OAuth callbacks still require verification on device.

Native Bot Permissions toggles call original `POST /api/plugins/grants` and `DELETE /api/plugins/grants?kind=mcp&ref=...&agentId=...`; server, not the client, judges admin rights, Bot access, underlying connection and tool policy. Fresh source `GET /api/plugins/for/:agentId` resolves the displayed state.

**Native web search** is opt-in using Agents API `web_search` with low context size; no new search service.

**Managed Automations** exist only as tested provider transport, not product-coupled schedules. `createAutomation` uses original session ID passed by caller and conservative cron/once bounds; no owner/auth endpoints currently expose it and no source RoutineStore mapping exists.

**Cost fallback** refuses unsupported required `spend_control`; never emits provider error body/secret and never auto-enables `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY`.

## 4. Explicit capability matrix

Legend: **Code** means exists as source code, not successful full product. **Offline** only where test actually passed. **Device** and **Live** require independent receipts.

| Capability | Implemented in code | Passed offline tests | Passed device tests | Passed real-provider tests | Blocked |
| --- | --- | --- | --- | --- | --- |
| Original source Bot/Channel profiles | Yes, inherited | Earlier source suites | Not this branch | Not this branch | Multiuser production cutover |
| Original source TaskStore + managed task adapter | Yes, inherited | Yes, source isolated DB fixture | No | No | Cancel/retry/reopen/artifacts/production |
| Durable ordinary questions and source approvals | Yes, inherited | Yes, questions fixtures | No | Earlier single choice demonstration only, not this branch | Long waits/production/remote crash |
| Controlled original source MCP read/write | Yes, inherited | Yes, read/write fixture | No | No | External OAuth/vendor live credentials |
| Opt-in direct public read-only managed MCP | Yes | Yes, manifest/permission tests | No | No | Active session revocation, source production |
| Managed web search | Yes, opt-in in dev assembly | Server typecheck | No | No | Production Bot grants, cost checks |
| Provider Automations HTTP transport | Yes | Yes, gateway HTTP fixtures | No | No | Owner/Bot/routine mapping, invocation/webhook, notifications |
| Source Memory CRUD and bounded initial context | Yes, inherited | Yes, approved memory unit tests | No | No | Dynamic forget/retrieval/external provider transcript |
| Native Connections connect/disconnect | Yes, SwiftUI source API | **No Swift compile run** | No | No | Broker credential forms, OAuth callback/device confirmation |
| Native MCP grant toggles | Yes, SwiftUI source API | **No Swift compile run** | No | No | Admin permission/device and session revocation |
| Native upstream A2UI subset and saved views | Yes, inherited | Gateway/parser tests only | No | No | Full v0.9, incremental, dynamic lists, UI actions, general artifacts |
| Production Better Auth multiuser managed runtime | **NO** | No | No | No | Original `index.ts` still mounts CopilotKit Intelligence |
| Autonomous scheduled product run and push | **NO** | No | No | No | End-to-end automation owner mapping, webhook, APNs |
| Hosted sandbox/computer and Files | Transport support inherited for restricted environment/artifact reads | Narrow provider fixture only | No | No | Full native execution UX and policy |
| Managed skill/vault and authorized credential MCP | **NO** | No | No | No | Source authorization boundary and native Agent config |
| Spending `spend_control` incompatibility refusal | Yes | Yes, gateway HTTP fixture | N/A | No | Provider-compatible hard limits, owner quotas |

## 5. Critical production cutover work still REQUIRED

Original `openbot/server/src/index.ts` remains a 2,800+ line production composition using `CopilotKitIntelligence`, `IntelligenceAgentRunner`, and `mountCopilotRuntime` across routines/responsibilities/approval/direct conversations. Its `loadConfig` still requires Intelligence settings. `openbot/server/src/agents/managed-development.ts` is deliberately bound to fixed `DEV_ACTOR`, cookie token, loopback-only address and rejects `NODE_ENV=production`.

**DO NOT** bypass this by renaming the development service, binding 0.0.0.0, disabling production guard, using a shared dev actor in Better Auth, or routing all users into one session. The actual work is to move existing provider identity/scope/reconciliation seams into the original Hono and Better Auth production composition, with `resolveRequestActor`, source `AgentProfileStore`, `ChannelStore`, `DeliveryStore`, source `WorkQueue`, `TaskStore`, `createPluginStore`, original approvals, retained tenant ownership, and replacement of **all** Intelligence-dependent execution branches. Consolidate a single runtime policy, health endpoint, worker restart, APNs, and environment in the existing server. Retire old execution only after equivalent covered journeys.

**This production code was not implemented in this turn.** It is not deployment-ready and cannot be represented otherwise. The laptop agent should not confuse this document's existing source production deployment infrastructure with an OpenAI managed production cutover.

## 6. Auth, environment and production launch

Current loopback managed development only:
- `DATABASE_URL`: original PostgreSQL; for tests **disposable isolated DB**, never a personal account database.
- `OPENAI_API_KEY`: server only.
- `EUPHORIA_DEV_TOKEN`: at least 32 characters, loopback-only development cookie.
- `EUPHORIA_MODEL`: managed model selection, override deployment-compatible availability.
- `EUPHORIA_ENABLE_SOURCE_MCP=1`: enable original source PluginStore/vault when credentials configured.
- `KEY_ENCRYPTION_KEY`: base64 exactly 32 secure random bytes, server-side only.
- `OPENBOT_BROKER_PROVIDER`: original source Composio or Arcade provider choice.
- `EUPHORIA_NATIVE_READ_MCP_ORIGINS`: comma-separated **HTTPS origins only**, explicitly allowlisted by operator. Omit by default; only anonymous public read endpoints with current exact Bot grants qualify. Not safe for sensitive data/revocation until live session retirement proven.
- `EUPHORIA_MANAGED_WEB_SEARCH=1`: optional paid managed web search in dev assembly.
- `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY`: **DO NOT SET**; previous single-use authorization expired.

Original production source config in `openbot/.env.example` includes `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `INITIAL_ADMIN_EMAILS`, one identity-provider family `GOOGLE_OAUTH_*` or `MICROSOFT_OAUTH_*` or `OKTA_OAUTH_*`, `OPENBOT_PUBLIC_URL`, `OPENBOT_APP_URL`. **`OPENBOT_SINGLE_USER=true` is unsafe if publicly reachable**. Require HTTPS (reverse proxy), authenticated different accounts and signed cookies, plus secure vault and callback route. Those are **requirements for future managed cutover**, not evidence it already runs without Copilot.

Dev server only, for local fixture/testing after explicit budget gate:
```bash
cd EUPHORIA
# Load ignored local env file securely, never echo keys in logs.
DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:55432/euphoria_dev' \
  bun --env-file=gateway/.env openbot/server/src/agents/managed-development.ts
```
Never expose `127.0.0.1:8788` local token service to the internet. Do not run live model execution without compatible spending control and renewed user authorization.

## 7. Offline CI executed

Completed successful run at code commit `f21980cf43c9859a466a8fd34824aff957f99993`:
https://github.com/mohithgowda99/EUPHORIA/actions/runs/40818824984
- Source Bun TypeScript server typecheck: passed.
- Isolated PostgreSQL source questions integration: 3 passed, 0 failed.
- Source TaskStore integration: 1 passed, 0 failed.
- Source MCP read/write integration: 2 passed, 0 failed.
- Existing JSONB migration fixture: 1 passed, 0 failed.
- Source unit tests including native MCP manifest: 8 passed, 0 failed.
- Gateway regression suite including Automations/spending compatibility: **185 passed, 0 failed**.

**Current code after the changes above also passed full Linux backend CI:** https://github.com/mohithgowda99/EUPHORIA/actions/runs/40819545709, head `44d9065b3ed695f808841efe14e1aa3a7400505e`; full workflow completed successfully. The branch CI checks TypeScript, isolated source integrations and gateway, NOT iOS Swift, real provider, deployment or full native A2UI. No live provider verification was performed this turn. Read newer runs if further code is committed.

Repro commands:
```bash
git fetch origin
git worktree add ../EUPHORIA-FINAL-PHASE1 \
  -b validate/final-phase1 \
  origin/feature/final-phase1-engineering-20261029
cd ../EUPHORIA-FINAL-PHASE1
git rev-parse HEAD
cd openbot
bun install --frozen-lockfile
bun run --filter server typecheck
bun test server/tests/managed-native-mcp.test.ts \
  server/tests/managed-connected-mcp.test.ts \
  server/tests/managed-memory-context.test.ts
cd ../gateway
npm ci
npm test
```
For DB integration tests, use **separate freshly migrated disposable databases** for questions, tasks, MCP and JSONB; use `openbot/server/scripts/migrate.ts` with `DATABASE_URL` pointing to each. The exact reset and isolated suite logic is in `.github/workflows/euphoria-core-gates.yml`.

## 8. Mac/Xcode and physical-device verification

```bash
cd EUPHORIA
swift test --package-path ios/VisualRuntimeCore
swift test --package-path ios/Spikes/A2UIRendererComparison
xcodebuild -resolvePackageDependencies \
 -project ios/Euphoria.xcodeproj -scheme Euphoria
xcrun simctl list devices available
# Replace simulator with installed device name or destination id:
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
 -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' \
 -derivedDataPath /tmp/euphoria-final-phase1 build test
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
 -configuration Release -destination 'generic/platform=iOS Simulator' \
 -derivedDataPath /tmp/euphoria-final-phase1-release CODE_SIGNING_ALLOWED=NO build
```
On the Mac: use `xcrun simctl boot <available-UDID>`, `xcrun simctl install <UDID> <built-Euphoria.app>`, and `xcrun simctl launch <UDID> dev.euphoria.ios`. Use an actual HTTPS backend origin, not Mac-local loopback, for device tests. Validate original Better Auth session cookie on two independent users; different user's own Bots/memory/Inbox/credentials must never be visible or actionable. Native sign-in OAuth proxy/callback, tool grant admin-only toggles, connection OAuth callback/refresh, disconnect and vendor reconciliation must be exercised on an iPhone. No Xcode pass claimed.

**A2UI acceptance still to implement, then test**: upstream pinned dependency resolution; multi-surface create/update/delete, data update, stable drafts/revisions, streaming partial updates, nested trees, text/checkbox/select/slider/forms/list/template/tabs/modals/actions/expressions, source-authorized roundtrip, concurrent edits, deleted/recreated identity, historical restore, artifact WKWebView isolation. Compare reference v0.9 protocol fixtures to Swift renderer, not screenshot alone.

**Task acceptance**: real original TaskStore create/start/reply/cancel/retry/reopen/report/artifact, actual Bot permission, original receipt and archived history. Do not claim built for missing transitions.

**Human interaction**: original question persists app kill/backend restart, another device answer once, revoked Bot cannot resume, expired ordinary question explicitly starts NEW turn, controlled write never auto-replays, source work item shows truth.

## 9. Managed live tests requiring separate explicit approval

No live paid API calls should execute by merely enabling test flags.
When user authorizes a bounded budget **and** safe compatible provider quota:
1. One read-only public direct MCP invocation with original exact Bot permission and actual tool result.
2. One source PluginStore controlled write with human approval, one refusal, one revoked grant and no duplicate.
3. One scheduled automation invocation that creates/continues exact authorized managed source turn and reports an actual outcome, separate from invocation delivery.
4. One restricted hosted sandbox/file artifact lifecycle, one delegated managed subagent with product Bot ownership preserved.
5. One valid streamed A2UI interactive answer and accepted source final history.
Record exact source Inbox ID, owner, Bot, channel, provider session/root, automation invocation ID, work receipts, actual spending, and device screenshots with secrets redacted.

The deployment used in an earlier live test rejected documented `spend_control`. The gateway now fails explicitly without a silent uncapped retry. **App-side estimated quotas are not provider-side hard caps**, and current implementation does not yet enforce complete per-user cost/compute concurrency. Keep paid validation blocked until compatible limits and explicit user budget permission are obtained.

## 10. Remaining source-service integration plan (not done)

- Production: migrate one authoritative execution seam into current Hono/Better Auth original source composition. Remove Intelligence runtime for EUPHORIA Bots only after all direct/headless/routine/responsibility/approval/callback flows use managed Agents sessions and durable source WorkQueue; secure HTTPS, production workers, deployment, APIs, webhooks and health.
- Tools: use direct Agents native MCP for policy-safe cases only; credentialed writes require original approval gate/proxy. Managed skills, vaults, hosted computer/files with scoped permissions and source proof.
- Autonomy: map original RoutineStore IDs to managed Automations IDs and invocation receipts in original database with non-destructive migration, webhook verification, notification provider and source task correlation. Do not use invocation delivery as success. Decommission source cron executor after parity and rollback.
- Tasks/Memory: complete safe cancel/reopen/retry history, artifact exposure and authorized memory retrieval/revocation semantics.
- A2UI: full pinned catalog and upstream 0.9 wire ops with original revision/action authority and source renderer conformance.
- SwiftUI: complete native OAuth broker credential input/reconnect flow, source task activities, native A2UI actions and results. No fake data.

## 11. Rollback / recovery

- Branch rollback without affecting users: checkout origin/`feature/phase1-core-e2e-convergence-20261029` in a separate clean worktree; do **not** rewrite existing integration branches or force-push.
- No new database migration was created on this final branch. Existing `0071` JSONB migration transforms legacy completed receipts; backup and test on disposable clone before applying. Never drop original Inbox, response, Task, Memory or credential records to “reset” status.
- Native direct MCP feature rollback: omit `EUPHORIA_NATIVE_READ_MCP_ORIGINS`; no native tools admitted. Source plugin executor remains. Do not assume stopping new grants revokes in-flight managed sessions.
- Native web-search rollback: unset `EUPHORIA_MANAGED_WEB_SEARCH`.
- `spend_control` compatibility: leave capped session create refusing unsupported provider; no unlimited fallthrough.
- Deployed service cutover has **not** occurred, so there is no production runtime rollback in this branch. Before a future cutover, record current deployed build/container digest, DB snapshot, cloud secrets owner, webhook validation key, queues, migration applicability and downtime recovery; validate multiuser isolation first.
