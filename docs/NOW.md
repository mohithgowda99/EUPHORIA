# EUPHORIA | Phase 1 engineering checkpoint | 2026-10-29

Current implementation branch: `feature/final-phase1-engineering-20261029`, based on convergence `78f746d2b3f4f3c57861853109bff0290132edca`. Main and earlier source branches have not been modified or merged.

## What actually exists

- Original OpenDuet source product stores for Bots, Channels, Tasks, Delivery Inbox, approved Memory, PluginStore grants, person questions/answers, and approvals.
- A **loopback-only managed development** assembly using the OpenAI Agents API, original source provider/session/root correlation, retained provider replies, source task adapter, durable questions, expired-call recovery, native historical generated views, and source-backed controlled MCP calls.
- Added direct OpenAI-hosted **read-only MCP** only for current exact per-Bot grants to operator-allowlisted, anonymous, public HTTPS origins. Anything credentialed, brokered, destructive or writing stays on original source executor and its approval checks. An existing remote managed MCP session is not proven immediately revocable, so this feature is opt-in and **not production approved**.
- Optional native OpenAI web search tool in managed development configuration.
- Agents API Automations transport methods in the existing gateway client; this is **not yet** source RoutineStore reconciliation, owner attribution, notifications, or completed scheduled work.
- Native iOS Connections list, server discovery, verified-source OAuth initiation and explicit disconnect with source reread; broker credential-field input is still unsupported in native UI.
- Native per-Bot connected tool permission toggles using the original grant/revoke endpoints (admin authorization remains server-owned), with original Skills permission management preserved.
- Selectively restored the continuation branch's exact-root recovery filter and its exclusion of schema-repair work from human decision warnings.
- A clearer refusal when deployed API rejects `spend_control`: no automatic uncapped retry.

## Verified evidence

GitHub CI https://github.com/mohithgowda99/EUPHORIA/actions/runs/40818824984 passed TypeScript typecheck, disposable PostgreSQL questions/Tasks/MCP/JSONB integration fixtures, native MCP unit fixtures, and gateway suite (**185 passed, 0 failed**) at commit `f21980cf43c9859a466a8fd34824aff957f99993`.

**Tests on later commits must be identified from the new head's CI run**, not inherited from that earlier passing commit. SwiftUI changes and A2UI rendering have not been compiled with Xcode in this execution environment. No further paid OpenAI provider calls were authorized.

## Still missing, no completion claim

**Production cutover NOT DONE.** `openbot/server/src/index.ts` still composes CopilotKit Intelligence for headless, responsibility, approval and runtime execution. `managed-development.ts` still uses fixed `DEV_ACTOR`, a loopback token and refuses production launch. This cannot be safely exposed as the public Better Auth multi-user service by toggling a flag.

**Autonomy NOT DONE.** Managed automation transport has no original owner/Bot/Routine-to-provider mapping, webhook verification, invocation-to-turn reconciliation, notifications, safe source cron retirement, or verified deployed hosted service.

**Native A2UI NOT DONE.** The pinned upstream Swift renderer is used for supported surfaces; full 0.9 catalog parity, streaming incremental updates, values/drafts/revisions, source-authorized action roundtrips, generated artifact sandbox and physical-device testing remain unverified.

**Managed capability scope NOT DONE.** Full hosted computer, sandbox and files flows, managed skills/vault use, direct credentialed MCP with product approval enforcement, native task artifacts and memory retrieval, cost quotas, user-facing resume/cancel/retry need production integration and test.

## Next engineering step

Refactor the existing source production `index.ts` composition to install a **single per-user authenticated managed execution seam** in place of all CopilotKit Intelligence runners (rather than mounting the dev assembly), then preserve the original source Inbox/WorkQueue/approvals. Only after production multiuser isolation passes should source routines be migrated to managed automations and push enabled. See `docs/agents/EUPHORIA_FINAL_PHASE1_IMPLEMENTATION_HANDOFF.md` for exact laptop validation, open gaps and rollback.
