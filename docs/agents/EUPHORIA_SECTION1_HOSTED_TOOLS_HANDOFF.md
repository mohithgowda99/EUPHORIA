# EUPHORIA | Section 1: Hosted tools, sandbox, files and delegation

**Date:** 2026-10-29  
**Implementation branch:** `feature/phase1-hosted-tools-files-delegation-20261029`  
**Parent:** `feature/final-phase1-engineering-20261029`  
**Scope:** The first of five requested feature sections. Source-owned development backend and genuinely native iOS UI. The production Better Auth/CopilotKit cutover remains deliberately excluded by earlier user direction.

## Result: implemented in source code, NOT device/live-verified

This implementation extends the existing OpenAI Agents API gateway. It does NOT implement a second agent runner, second account model, shadow artifact store or new remote computer. Original OpenDuet Bot/Channel ownership, source Inbox, session link, original approvals and WorkQueue remain authoritative. Actual source/Swift/Xcode and real-provider acceptance remains deferred to the laptop agent, as requested.

| Capability | Implemented code | Unverified / limitation |
|---|---|---|
| Source Bot-scoped live web search | Explicit `webSearch` grant, AND operator `EUPHORIA_MANAGED_WEB_SEARCH` opt-in required; transport uses native `web_search` | Real provider search and quota not exercised |
| Hosted code sandbox | Source Bot opt-in; constrained `openai_hosted` SMALL container, **network disabled**; initial session manifest and sandbox-focused instructions | Hosted provisioning and command execution not live tested |
| Delegation | Source Bot opt-in, capped 1–3 concurrent managed subagents; native roster from provider `/subagents` and no artificial progress | Provider delegation execution, nested provenance, subagent result/artifact acceptance not live verified |
| Files IN | iOS fileImporter 1MiB; source owner+Bot+idle session+connected environment; source `work_items` receipt PRECEDES provider POST; immutable upload ID; unsafe failures do not replay | Existing provider environment connected/idle receipt not verified live, large files intentionally unsupported |
| Files OUT | Provider immutable artifacts only with exact source Inbox-completed root and current Bot/channel/session; 8MiB max, path within `/workspace/outputs`; binary octet-stream no redirects; native ShareLink | Provider publishing, history, physical-device export not live verified |
| Permissions | Original-source Bot owner required; settings default deny; PUT becomes immutable after any saved session reservation; same original auth gates | Atomic cross-process permission update during simultaneous first-session reserve not proven |
| Offline regression fixtures | Hosted grants parser, source DB authorization, artifact metadata, safe gateway environment/file/subagent methods | New branch's offline and Swift suites have not been executed by this handoff |

## New/changed source

- `openbot/server/src/agents/managed-hosted-capabilities.ts`: authoritative original DB Bot grants and strict validation.
- `openbot/server/src/db/schema/managed-agents.ts`, `openbot/server/drizzle/0072_managed_bot_hosted_capabilities.sql`, and `openbot/server/drizzle/meta/_journal.json`: additive permission table.
- `openbot/server/src/agents/managed-development.ts`: opt-in hosted environment and delegation on original managed session definition; original owner routes for permissions, files and subagents.
- `openbot/server/src/agents/managed-source-submission.ts`: pass authorized hosted environment and delegation to original gateway.
- `openbot/server/src/agents/managed-hosted-artifacts.ts`: strict provider session/turn/path/size projection.
- `gateway/agents-client.mjs`: source-authorized sandbox Files API, bounded artifact streaming, and session subagent list transport.
- `ios/EuphoriaApp/OpenDuetSourceAPI.swift`: native typed source routes for grants, subagents, uploads/downloads; no provider API key on phone.
- `ios/EuphoriaApp/SourceBotPermissionsView.swift`: hosted compute, live web and delegation controls.
- `ios/EuphoriaApp/SourceConversationsView.swift`: private generated file list/export, input picker/draft and genuine delegated worker roster. Unconfirmed file intents are persisted to local SwiftData rather than silently retried.
- Tests: `server/tests/managed-hosted-capabilities.test.ts`, `server/tests/managed-hosted-capabilities.integration.test.ts`, `server/tests/managed-hosted-artifacts.test.ts`, `gateway/tests/agents-hosted-files.test.mjs`.
- CI: `.github/workflows/euphoria-core-gates.yml` now includes this feature branch and new offline fixtures.

## Native acceptance flow

1. Open Bots, select a personally owned Bot **before** its first managed session.
2. In Bot Permissions choose Hosted Sandbox, Delegation (max 1–3), and/or Live Web Research. An existing reserved provider session locks tool configuration; changing flags does not silently reconfigure a remote session.
3. Start a Bot conversation in EUPHORIA. The server creates one provider session with the exact selected capabilities, paid inference only under separately approved budget controls.
4. For file input **after** sandbox has connected and source session is idle, tap the paperclip. Choose a file up to 1MiB. The client saves a durable upload identity, the source stores a work receipt before uploading, then the iPhone drafts a prompt referencing the returned sandbox path. It does not send that prompt until the user presses Send.
5. Ask the Bot to analyze/transform the file and publish completed results in `/workspace/outputs/`. The app lists only artifacts of finished, source-root-correlated turns. Download privately and export with iOS ShareLink. Actual bytes must match immutable provider metadata.
6. When delegation is enabled, the conversation shows actual provider subagents; it does not equate `active` or `closed` with the root task succeeding.

## Explicit not-done gates

**Hosted computer/browser use is NOT silently enabled.** The Agents API requires `computer_use`, a desktop, configured network origin policy, per-origin browser approval and sign-in handling. Importantly, per-origin approval is NOT pre-approval of each subsequent browser write. The existing original source write approval policy cannot currently guarantee a review of every consequential browser action in the provider-managed browser. Exposing unrestricted computer use would bypass the original human-in-loop boundary. Do not claim it as complete; either use a constrained, read-only trusted browser domain with verified no-write behavior or install a source-owned action-level policy and approval workflow before enabling it. Ref: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use

**Managed hosted Skills/Vault and credentialed direct MCP are NOT enabled.** The original PluginStore remains the credential vault and human-approved write executor. Exposing its secrets in a managed environment or auto-mapping a source Skill slug to an arbitrary uploaded ZIP is prohibited without explicit ownership/version mapping and remote revocation guarantees.

**Production cutover remains excluded.** This branch modifies the existing loopback development assembly, not original production `openbot/server/src/index.ts`.

**Live operational proof is outstanding.** No model fees, no laptop/Xcode, no provider-hosted session, no device install and no shared data migration were run in this chat. Previous passing CI belongs to the parent branch and must not be claimed for these commits. The deployed Agents endpoint previously rejected the hard spend_control parameter: never turn on uncapped spending automatically.

**Race/limits:** Existing session sandbox/delegation changes intentionally require a new Bot and new provider session. A concurrent first session reserve and grant edit has not yet been serialized behind one lock across processes. Large files, infected files, artifact previews, multiagent parent/child file provenance and user-facing cancellation/resume remain follow-up product acceptance work.

## Laptop agent validation, when ready

```bash
git fetch origin
git worktree add ../EUPHORIA-HOSTED-TOOLS -b validate/hosted origin/feature/phase1-hosted-tools-files-delegation-20261029
cd ../EUPHORIA-HOSTED-TOOLS
cd openbot && bun install --frozen-lockfile
bun run --filter server typecheck
bun run typecheck:tests
bun test server/tests/managed-hosted-capabilities.test.ts server/tests/managed-hosted-artifacts.test.ts
cd .. && npm --prefix gateway ci
npm --prefix gateway test
swift test --package-path ios/VisualRuntimeCore
swift test --package-path ios/Spikes/A2UIRendererComparison
xcodebuild -resolvePackageDependencies -project ios/Euphoria.xcodeproj -scheme Euphoria
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

For integration: use a NEW disposable PostgreSQL database with migrated schema through **0072** and `TEST_DATABASE_URL` set. Never test on a source user's database. The branch workflow migrates isolated temporary databases for the hosted grant fixture and original source lifecycle fixtures.

Before paid provider acceptance explicitly agree on provider-supported HARD spend limits and a user-authorized budget. Verify real provider `environment.type`, files API status and actual session/delegation output schema, source-root artifact list, eventual downloads, and no accidental replay after network loss. Validate SDK/provider behavior against official Agents API docs:
- https://developers.openai.com/api/docs/guides/agents-api/environments/files
- https://developers.openai.com/api/docs/guides/agents-api/multi-agent
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/environments/subresources/files/methods/create
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/artifacts/methods/retrieve

**Handoff classification:** Significant Section 1 implementation delivered; **NOT yet full hosted-tool parity**, for the explicit safety, hosted browser, credential and validation blockers above. Do not start claiming Section 2 is complete from this branch.
