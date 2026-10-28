# EUPHORIA: next implementation gates after live native choice

Base: `codex/managed-native-execution` at `7f94d2e`.
Review branch: `fix/native-completed-choice-lifecycle` (do not overwrite the laptop worktree, merge to main, or run paid inference).
The original 29 October laptop handoff at `docs/agents/2026-10-29-managed-native-handoff.md` remains authoritative for local setup, logs and prior negative evidence.

## Target and boundaries

Phase 1 = **actual OpenDuet iPhone product in SwiftUI**, OpenAI Agents API for execution, original OpenDuet stores/routes/permissions for product semantics, no duplicate services. All eight major capability families must work end-to-end: (1) Bots/Chat/Channels, (2) Tasks/Questions/Approvals, (3) editable Memory/Skills, (4) Connections/MCP/Plugins/Vaults, (5) Routines and autonomous execution, (6) hosted browser/computer/files, (7) native A2UI/Make/Gallery, (8) accounts/notifications/cloud/recovery. The reference screen ledger remains `docs/phase1-ui/OPENDUET_SOURCE_FIDELITY_LEDGER.md`.

## Fixes staged on this review branch

- Source native visual response puts completed surfaces **after their original user message and before the final assistant reply**.
- For a completed choice, original finished `work_items(kind='managed.native-response')` proves the accepted option and its label. Owner, channel, Bot, node and option are checked against the original saved surface. This label is projected into the original Inbox `completed_output` for reopening after the work queue's retention window, with read-time lookup for older saved rows.
- SwiftUI completed surfaces render a read-only decision receipt rather than disabled interactive choice/form/approval controls. Read-only gallery/artifact/display nodes keep the existing native renderer.
- New source and native tests exercise completed choice labeling/order and backward-compatible decoding.

**No Mac test, database migration, Xcode build, API call or production deployment was executed here.** Review the patch and run the full tests before cherry-picking. A previously completed surface without an accepted source response reports 'Choice closed', not an invented selection.

## Critical P0: durable human interaction, not a fast-tap demo

Reconcile the original source `approvals/questions.ts` (`person.question`, `person.response`, `questionResponseMessage`), source approval continuations, `managed-development.ts` response queue and the actual Agents `required_actions` lifecycle.

Acceptance matrix (start with deterministic provider fixtures and a disposable PostgreSQL database):

1. A native request creates one source Inbox and one provider root; the Bot asks a question. Persist the source-owned question and its exact provider call correlation.
2. Terminate the app and backend, advance a clock by hours, restart, reopen a different device. The exact pending question is still available, correctly scoped, and no provider call was resent.
3. When the provider call is **still pending**, accept an authenticated answer exactly once via original question/decision journal and submit exactly the pending provider action. A simultaneous second device/action must not win twice.
4. When the provider call is **no longer pending/expired**, preserve the source answer and continue with an authorized *new* provider turn using original question+answer context. Do not claim the stale call executed, fake a tool result, or replay external actions. This must be proven against the actual supported provider semantics before enabling the fallback.
5. Verify denied/revoked ownership, missing Bot/channel, rejected provider response, lost HTTP receipt, crashed worker after POST, retries, and cancelled tasks. Each must produce a truthful visible state; no false success.
6. Test exact completion projection after relaunch and on a second authenticated device. Distinguish a pending choice, accepted answer, completed result and settled read-only receipt.
7. Verify a real late answer with explicit bounded API spending once the deployed provider supports it and the user separately approves the cost. Do not reuse the earlier uncapped-test permission.

**Do not build a new question store or scheduler**. Adapt the original OpenDuet services. If provider state cannot be safely continued, keep an explicit recoverable source question instead of faking completion.

## Other P0 blockers

- Original `openbot/server/src/index.ts` still uses CopilotKit Intelligence. The working `managed-development.ts` is **loopback dev-only** and mounts limited routes. Move the managed provider seam into the source production composition after independent review, with real Better Auth and no development token bypass.
- `openbot/server/src/db/schema/managed-agents.ts` imports `jsonb` from `drizzle-orm/pg-core`, whereas original OpenDuet uses `./json.ts` to avoid double serialization with Bun SQL. Laptop psql observed completed output as JSONB string. Verify `jsonb_typeof(completed_output)` and old-row compatibility; stage a safe migration, test on a disposable clone, then apply only after backup. Do **not** change storage mapping and risk disappearing saved live receipts without migration proof.
- A2UI-Swift spike is not adopted. The successful live Leg day control used the narrow native choice contract, **not full v0.9 A2UI**. Run reference-vs-Swift fixtures covering dynamic templates, bindings, actions, updates, surface delete/recreate, streaming and state restoration. Adopt a compatible engine rather than custom-rebuilding A2UI.
- The deployed Agents API rejected `spend_control`; default budgeted session creation is blocked. Never silently enable uncapped sessions. Test this API/account incompatibility with official contract evidence and obtain separate explicit spending approval for paid tests.
- No external tools are granted by the development assembly. Use Agents API hosted tools/MCP/plugins/skills/vaults, but retain original OpenDuet per-user/per-Bot authorization, actual approval and revocation. Start with **one read-only integration**, then a safely approved effect; do not duplicate connector runtimes.
- Real native input-to-completion/relaunch is unproven; report screenshot, xcodebuild and provider receipt evidence separately.

## Execution order when Mac Codex usage returns

1. Fetch this review branch into a separate worktree; inspect diff from `7f94d2e`, verify no local conflicts; **run 177 gateway, 33 source, 5 database, 76 Swift core, 39 native/Xcode regression gates** as appropriate; fix any regressions. No paid calls.
2. Run final Simulator relaunch/second-device read of completed choices, verify chronological placement and no stale buttons. Reproduce and fix JSONB old-row compatibility on disposable PostgreSQL.
3. Implement and test the durable multi-hour human question/approval workflow above, including expired-provider fallback.
4. Port the proven original-source managed execution seam into production server with proper auth, then bind actual Bots, Tasks, plugin grants, memory and original UI. Complete one safe end-to-end read-only MCP connection first, followed by permission-gated tool execution.
5. Complete full A2UI conformance and meaningful interactive composition (not hardcoded two pills); preserve the generic native renderer and isolated HTML artifact boundary.
6. Use managed Automations/hosted environments where compatible; hook original routine/task/notification state. Deploy a small HTTPS backend plus persistent Postgres only after authentication, webhook recovery, revocation and cost gates pass. Hosting vendor is not selected; GCP is optional.

**Success is source parity on a real iPhone, not a test count.** Explicitly report what each of the eight families can do today versus what remains unavailable. Keep `main` untouched and never rerun uncapped inference without new user authorization.
