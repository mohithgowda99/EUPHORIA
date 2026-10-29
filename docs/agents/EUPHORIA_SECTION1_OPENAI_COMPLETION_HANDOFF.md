# EUPHORIA | Section 1 OpenAI-first completion implementation handoff
Date: 2026-10-29
Branch: `feature/phase1-section1-openai-completion-20261029`
Parent: `feature/phase1-section1-lifecycle-20261029`

## Status and product definition
**Implemented in source code:** all four Section 1 workstreams for the constrained iPhone release:
1. OpenAI-hosted browser for **vetted, publicly accessible documentation sites**, with native exact-origin approval/denial and no sign-in;
2. OpenAI-managed delegation, exact source-root correlated coordinator activity, source-approved root outputs and genuine provider subagent roster;
3. source-granted, operator version-pinned OpenAI hosted Skills and original OpenDuet MCP approval executor, avoiding new vaults/runners;
4. original Inbox-scoped cancellation, no-replay provider receipts, read-only upload reconciliation, persisted sessions, generated file preview/download and provider-status receipts.

**NOT a verified real end-to-end iPhone release.** Tests and macOS/Xcode/provider acceptance are reserved for the laptop agent by user request. Production Better Auth cutover remains out of scope. This branch is not merged to main.

## Reused OpenAI features, with one server API key
- OpenAI Agents API session harness and persistence, hosted code sandbox, provider-managed subagents, tools `web_search` and `computer_use`, public-site origin approvals, hosted skill references, immutable artifacts, environment Files list, and cancellation.
- No homemade agent runner, browser engine, subagent scheduler, task data store, file/artifact store, or second secrets vault.
- The original OpenDuet source system still owns Bot/profile/channel grants, encrypted MCP credentials and write approvals, durable WorkQueue/Inbox and persisted human questions. Those components are the product's authorization boundary, not a duplicate OpenAI execution infrastructure.

## Four outcomes: implementation details
### A. Browser/computer use
- Added `managed_bot_hosted_capabilities.browser` with additive migration `0073_managed_hosted_browser.sql` and default DENY. Original owner selects it *before* session reservation.
- Separate browser Bot from file-sandbox/delegated Bot: a restricted browser requires desktop and `network.access=restricted`; the network-disabled file sandbox remains isolated. Operator opt-in environment `EUPHORIA_PUBLIC_BROWSER_HOSTS` supports exact, vetted documentation domains only: `developers.openai.com`, `www.rfc-editor.org`, `www.w3.org`. Missing config disables the UI toggle.
- OpenAI executes the browser; `browser-approvals` reads current provider `required_actions` only after original source Bot/channel/session/root correlation, with exact owner authorization. iPhone user chooses Allow/Deny. Requests from other origins cannot be approved. Authentication is cancel-only, no password/OTP stored or echoed.
- Every decision has original `managed.browser-decision` pre-POST work receipt. Uncertain acknowledgment is never replayed. Origin approval does NOT authorize consequential browser writes. For connected accounts and external writes, use existing `euphoria_connected_mcp` via the original PluginStore and one-time approval.

### B. Delegation/progress/files
- Managed coordinator/subagents still use OpenAI's `multi_agent` harness. Session-level roster comes from provider, no artificial percent-complete.
- `delegation-activity` now reads actual `create_subagent_call`, `send_subagent_input_call`, `wait_for_subagents_call`, `interrupt_subagent_call` items for the one saved original source root. The iPhone displays real provider statuses and only claims completion once original source Inbox is sent and root is completed.
- Subagents share the same environment and filesystem. Root coordinator is instructed to collect delegated outputs and write finished deliverables under `/workspace/outputs`; original source provides only root-correlated, completed immutable artifacts. Direct subagent artifacts with no proven root association remain deliberately inaccessible, not falsely relabelled.

### C. Skills/permissions
- Existing original source Bot skill grants project into bounded instructions or, where the *operator* explicitly maps slug to immutable `skill_id` + numeric version, into OpenAI-hosted skills.
- Next-turn continuation checks actual provider-mounted skill references against live original source grants. If a grant changed, it **blocks reuse** of an existing session instead of leaving a revoked skill silently usable on later turns. In-flight revocation is not guaranteed: stop original active run, then use a fresh Bot/session. The current first session configuration is immutable.
- Existing source PluginStore remains the only credentialed MCP write executor; no vault secrets copied into a hosted environment. Direct public read-only MCP is opt-in and has its separate caveats.

### D. Lifecycle/recovery
- Original Inbox-bound native cancellation requests are single-shot, with exact active root guard, status and ambiguity wording. A provider HTTP 202 acknowledges a request, not completed cancellation.
- If a file upload POST outcome is unknown, the native UI can query original `managed.hosted-upload` receipt and OpenAI's read-only environment file list. Matching path and byte count is `present_unverified`, not proof of content integrity. No automatic resend or fabricated success.
- Source-tied root status and provider coordination events are visible. iPhone QuickLook handles supported source-verified downloaded files.

## What is deliberately not claimed as complete
- **Unrestricted hosted browser writes**, purchases, forms, private account login or arbitrary destinations. OpenAI origin authorization cannot intercept *every consequential click*. The external writable action surface is the original source-approved MCP executor. A broader computer product would require a provider offering per-action authorization or an execution runtime controlled by EUPHORIA; not justified for this release.
- Immediate session revocation during an already-running hosted skill or delegated tool call. New-turn invalidation is enforced, but running calls require explicit stop and reconciliation.
- Provider live schema compatibility, artifact publication, browser events, native Swift build, unit/DB CI and end-to-end work completion have not been verified in this chat.
- Multi-user production cutover and autonomous scheduling, which belong to later stages.
- The deployed Agents API previously rejected `spend_control`; do not silently switch to uncapped inference, and do not spend money without the user's authorization and working hard usage cap.

## New implementation files
- `openbot/server/src/agents/managed-hosted-browser.ts`
- `openbot/server/drizzle/0073_managed_hosted_browser.sql`
- `openbot/server/tests/managed-hosted-browser.test.ts`
- `openbot/server/tests/managed-hosted-browser.integration.test.ts`
- `gateway/tests/agents-hosted-browser.test.mjs`
Other changes in `managed-development.ts`, `gateway/agents-client.mjs`,
`managed-hosted-capabilities.ts`, `managed-source-submission.ts`, migration journal,
`OpenDuetSourceAPI.swift`, `SourceBotPermissionsView.swift`,
`SourceConversationsView.swift`, and CI.

## Laptop handoff
Use a **new worktree**. Do not overwrite other in-flight work or merge to main without complete validation.

```bash
git fetch origin
git worktree add ../EUPHORIA-SECTION1-OPENAI -b validate/section1-openai origin/feature/phase1-section1-openai-completion-20261029
cd ../EUPHORIA-SECTION1-OPENAI
cd openbot
bun install --frozen-lockfile
bun run --filter server typecheck
bun run typecheck:tests
bun test server/tests/managed-hosted-browser.test.ts server/tests/managed-hosted-cancel.test.ts server/tests/managed-hosted-capabilities.test.ts server/tests/managed-source-skills.test.ts server/tests/managed-hosted-skills.test.ts
cd ../gateway
npm ci && npm test
cd ..
swift test --package-path ios/VisualRuntimeCore
swift test --package-path ios/Spikes/A2UIRendererComparison
xcodebuild -resolvePackageDependencies -project ios/Euphoria.xcodeproj -scheme Euphoria
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
GitHub Actions `EUPHORIA core branch gates` runs isolated migrated PostgreSQL through `0073` for original question/task/MCP/hosted/browser fixtures on this branch. Verify exact HEAD action status instead of borrowing a green prior-branch result.

Live acceptance only with a compatible *enforceable* provider spending cap and explicit budget: one new source-owned Bot, exactly one origin approval and refusal, one source-approved MCP read/write, one file upload, one delegated root final file, one cancellation/expiry recovery. Record real original Inbox/root/provider IDs and actual result receipts. Never equate an accepted HTTP request with completed agent work.

**Release scope verdict:** Section 1 is now functionally implemented in code for a safely constrained OpenAI-first personal-agent experience. It is NOT validated or full unrestricted computer-use parity. Phase 2 is not started.
