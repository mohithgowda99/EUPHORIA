# EUPHORIA managed-first implementation audit (2026-10-28)

Decision order: **(1) native Agents API, (2) original OpenDuet/OpenBot service, (3) minimal compatibility adapter**. Phase 1 is OpenDuet as-is on iPhone, not ETERNAL design. Preserve previous backend/native branches and existing SwiftData/API journals until migration and real-provider/device parity pass. NO production switchover from this audit.

## Capability boundaries and target choices

| Source responsibility | Managed Agents API (verified official docs) | Keep from OpenDuet/OpenBot | Custom gateway fate and evidence gate |
|---|---|---|---|
| Conversation execution, history, streaming, async recovery | Sessions, turns, item/event SSE, required_actions, webhooks, compaction | `channels/routes.ts`, `thread-identity.ts`, Bot membership, read state, original transcript semantics | **ADAPT** only user→session/thread mapping, terminal statuses and idempotent action receipt. No second agent runner. Source sessions cannot be inferred from UI session rows. |
| Tasks | Runs/turns execute in hosted Agents | `openduet/task-store.ts`, `task-threads.ts`, `task-report.ts`, `proactive/engine.ts`, original TaskRecord/channel relationship and status semantics | **TRANSITION ONLY**: `gateway/tasks.mjs` uses Agents execution; migrate to original source Task store instead of maintaining a parallel task catalog. First integration now shares *exact original* taskStatus via `openduet/task-status.ts`. |
| Routines and schedules | Agents API Automations: cron/IANA, one-time, new/existing session, pause/resume/delete, invocation history, queued work on busy sessions; optional agent tool | `routines/schedule.ts` minimum 15-minute floor, `routines/store.ts` ownership, `routines/runner.ts` fatigue after ten consecutive failures, original statuses/notifications/UI | **PREFER MANAGED FIRING after proof**: custom `gateway/routines.mjs` cron sweeper is retirement candidate **not yet retired**. Need authorized managed automation ID mapping, invocation→task ID, revocation, failure accounting, exact run/reconcile, DST, pause/delete races, no duplicate runs. Managed runs can be delayed; OpenDuet skip/grace semantics are not identical. |
| Browser/computer | OpenAI-hosted `computer_use` + desktop environment, screenshots and origin auth; hosted environment runs commands | `computer/*` consent/host policy, permission gates, app activity and take-control semantics | **REPLACE EXECUTOR CONDITIONALLY**. Website origin approval does NOT guarantee confirmation before sensitive per-site actions. Require runtime that can enforce consequential-action boundaries or restrict reachable sites and preserve original controls. Do not discard OpenDuet computer until compared. |
| Sandboxes, files and artifacts | Hosted environments, file upload, published immutable output artifacts under `/workspace/outputs`, snapshot/lifecycle | `openduet/pages.ts`, `page-content.ts`, source page shapes, revisions, mutable user edits and Make gallery | **REUSE MANAGED EXECUTION ONLY**; immutable published files do not replace edit/history/ownership of user-facing pages or isolated GenUI WKWebView. Environment expiration + artifact retention need explicit cleanup. |
| Skills and plugins | Agents sandbox skills, package plugin combining skills and MCP configuration | `plugins/store.ts`, `plugins/selection.ts`, Bot grants and skill UI | **ADAPT** source skills into approved sandbox/plugin configuration after per-Bot grant and revocation. Packaging is not the product's permission model. |
| MCP/integrations | Agents API service/environment MCP and vaults for scoped credentials/OAuth; managed remote tool execution | `plugins/tools.ts` grant, audit, refusal semantics, `auth/`, `credentials/`, source connection UX | **CONDITIONAL** direct managed MCP only if provider cannot access revoked/foreign user scope and permission/audit effects remain observable. Original `callTool` is currently only enforced vendor path; do NOT bypass it for unreviewed managed MCP writes. |
| Multi-agent | Agents API `multi_agent.enabled` and isolated subagents with managed orchestration | `agents/profile-store.ts`, `agents/runtime-agents.ts`, Bot identity, team sharing and user-visible handoff ownership | **REUSE ORCHESTRATOR** when appropriate; source bot permissions remain original. Subagents inherit MCP/tools but do not support app function tools, so privileged operations require coordinator/authorized integration. |
| Memory | Agents API durable session context, compaction, saved items | `memory/store.ts`, `memory/routes.ts`, provenance, user review/edit/delete/opt-out, scoped sync | **REUSE PRODUCT MEMORY**. Provider session history is not cross-Bot, user-editable/revocable memory. Replace only `memory/intelligence.ts` CopilotKit mirror adapter with bounded user-scoped recall/context injection; don't introduce another memory DB. |
| Approvals and external effects | Sessions `required_actions`, browser origin/sign-in approval, MCP tool approvals | `approvals/{service,policy,execute,store}.ts`, per-user/role grants, audit and exact resume | **REUSE SOURCE POLICY**. Accepted provider event only records input; no execution proof. Must journal idempotency, deny/unknown/revoke, no external effect bypass. |
| Auth/DB/Channels | No OpenDuet-product identity/role/relationship store | `auth/` Better Auth and roles, `db/` Postgres/Drizzle, `channels/` roster and thread lifecycle | **REUSE UNCHANGED where possible**, add only client auth/session adapter. OpenAI project API key is not a per-person identity. |
| A2UI and UI | No generic native SwiftUI renderer supplied by Agents API | OpenDuet pinned `@copilotkit/a2ui-renderer@1.77.0`, source catalog, galleries/Make, standalone GenUI | **ADAPT** community `BBC6BAE9/a2ui-swift` only after source-comparison migration gate; keep native SwiftUI product shell and isolated WKWebView for HTML artifacts only. |

## Specific true equivalence gates

- Agents automations are saved provider schedules, **not completed runs**; invocation delivery is independent from turn completion. Their cron dispatch can be delayed randomly, paused automation may have an in-flight delivery, and deletion does not cancel existing turns. The original routine's ten-failure fatigue, 15-minute floor, source queue/ownership and channel updates remain product rules until proven equivalent.
- Hosted computer origin approval authorizes access to a host, not every purchase/write. Restrict irreversible effect pathways; retain source explicit approval and audit until equivalent runtime enforcement exists.
- Managed MCP executes tool calls on the server side, often without gateway seeing a per-call pre-authorization. Dynamic OpenDuet per-Bot grants, access revocation, user-owned credentials, consent and refusal/audit are acceptance gates before allowing write tools.
- OpenAI sessions are durable conversation state, **not** editable user memories. Preserve provenance/consent/erasure semantics in OpenDuet DB.
- Managed skills/plugins and published artifact files are execution/packaging primitives, **not** replacements for OpenDuet's skill administration, gallery/Make page versioning or data deletion.
- Cost: model input/output including reasoning; subagents multiply calls; tools, hosted sandbox/desktop/container time and third-party MCP services may be billed. Avoid idle hosted desktops and unbounded automation schedules. Enforce per-owner request rate, active run quotas, estimated spend ceilings and cleanup; inspect official usage accounting. This comparison did not incur provider charges.

## Reuse-first vertical slice implemented

1. Extracted **unchanged** `taskStatus` logic from original `openbot/server/src/openduet/task-store.ts` into `task-status.ts`; original service imports/re-exports it. No alternate status algorithm.
2. `gateway/tasks.mjs`, which already runs through the authenticated Agents `createSession/retrieveSession/listTurns/listItems` adapter, imports the SAME source-owned status rule. Current SQLite task journal remains a temporary authority and no second store was introduced.
3. `gateway/tests/source-task-status.test.mjs` covers five source priority states and the active/failed distinction. Existing `gateway/tests/tasks.test.mjs` exercises real HTTP/SQLite and injected Agents transport including ownership, creation, decision, reply, failure and restart. This is a deterministic provider stub, not a paid real-provider test.
4. On this Linux environment Node 22 `--experimental-strip-types`, a standalone copy of the source rule and same tests passed **2/2**. Full checkout gateway suite and Xcode unavailable here; **do not claim those tests passed on this commit**. Target gateway requires Node 24+. Changes are kept on `feature/phase1-reuse-first-integration`, without touching main or old branches.

## Immediate acceptance order

1. On Mac isolated checkout: resolve the HEAD, preserve uncommitted work, run Bun source tests, `npm ci --prefix gateway --ignore-scripts`, `node --test gateway/tests/*.test.mjs`, Xcode Debug/Release/XCTest. Resolve source status import on Node 24.
2. Keep separate native branch as checkpoint. Once native build and source differential tests pass, cherry-pick or merge its tested SwiftUI/A2UI changes into the integration branch with explicit conflict review. Do not merge unverified third-party code wholesale.
3. Compare a one-shot + recurring automation against source `routines` on identical UTC/DST/time-zone fixtures, pause/resume/restart and provider invocation receipts. Only then switch one owner-owned routine to provider automation while disabling its custom sweep atomically. Audit attribution must remain correct after delete and revocation.
4. Bind real OpenDuet Chat home and TaskSheet to original source services + managed Agents runtime; test Chat → genuine TaskRecord → interactive A2UI → authorized action → report → process relaunch. Until native/user/provider trace passes, Phase 1 parity is **not established**.

## Official source documents

- https://developers.openai.com/api/docs/guides/agents-api/overview
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/sessions/automations
- https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
- https://developers.openai.com/api/docs/guides/agents-api/tools/mcp
- https://developers.openai.com/api/docs/guides/agents-api/tools/vaults
- https://developers.openai.com/api/docs/guides/agents-api/tools/plugins
- https://developers.openai.com/api/docs/guides/agents-api/environments/files
- https://developers.openai.com/api/docs/guides/agents-api/multi-agent
- https://developers.openai.com/api/docs/guides/agents-api/errors
- https://developers.openai.com/api/docs/guides/agents-api/observability
