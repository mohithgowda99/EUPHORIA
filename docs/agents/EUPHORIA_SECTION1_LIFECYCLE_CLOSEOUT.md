# EUPHORIA | Section 1 hosted tools: completion attempt and honest closeout
**Date:** 2026-10-29
**Branch:** `feature/phase1-section1-lifecycle-20261029`
**Base:** `feature/phase1-hosted-tools-files-delegation-20261029`
**Scope:** Section 1 only. No Section 2 work, no production cutover, no force merges, no paid inference.

## Summary
**Section 1 has substantial source-code coverage, but is NOT fully end-to-end complete.**
The source-backed iPhone → original Bot → managed session → sandbox → files → iPhone
path exists in code; no Xcode/device or real paid provider execution occurred during this implementation.
The code preserves the existing OpenDuet source identity, grants, Inbox, queues and approval authority.

## Built before this branch (parent)
- Opt-in original-source Bot scopes for small, network-disabled OpenAI-hosted sandbox and 1–3 provider subagents.
- Source Bot web-search grant and operator opt-in.
- iPhone file import (1 MiB), original pre-reserved upload receipt, exact authorized provider environment.
- Root-correlated immutable finished-turn artifact listing/download (8 MiB), iOS ShareLink.
- Native genuine provider subagent roster, no fictional completions.
- MCP source PluginStore: live grants, source-approved writes and optional public anonymous read-only direct MCP.
- Original source memory, tasks, durable question/approval and A2UI subset.

## Added in this branch
1. **Source-authorized stop-run workflow:** `GET /api/delivery/conversations/:id/hosted-activity?agentId=...` and
   `POST /api/delivery/conversations/:id/hosted-cancel?agentId=...`.
   The source owner, Bot, channel, original Inbox, linked provider session and exact current root must match. Reject cancellation when other root turns could be active. Reserve immutable original `managed.hosted-cancel` work item BEFORE provider POST. An accepted 202 means the stop request was delivered, not that the agent finished. Uncertain writes and repeated requests never replay. Native Chat provides explicit confirmation, status and recovery wording.
2. **Permission/session race closure:** original hosted-capability updates and the original session-link reservation now acquire the SAME per owner/Bot PostgreSQL transaction-scoped advisory lock. A capability update never succeeds after a source reservation is recorded, even on different processes.
3. **Original granted Skills context:** bounded skill instructions come only from the existing source Bot's current PluginStore grant set, labelled untrusted. Skills with declared tool dependencies are not represented as installed or allowed to widen tool grants.
4. **Real version-pinned hosted skills:** operator JSON allowlist maps exact source skill slug to immutable OpenAI Skills API `skill_id` + numeric `version`. Runtime intersects with the source Bot's actual grant. Up to four references enter the existing provider-hosted environment manifest. No arbitrary inline ZIP, `latest`, vault reference or new tool grant is allowed.
5. **Native artifact preview:** supported generated files (PDF, images, TXT, CSV) can open in native QuickLook after source-authorized download; all other safe downloads still use ShareLink.
6. **Offline test fixtures and CI:** unit policy tests, original source receipt/restart cancellation integration fixture, gateway hosted skill manifest fixture. Branch workflow now includes these and isolates the cancellation integration database.

## Environment and operator configuration
Optional `EUPHORIA_HOSTED_SKILL_REFERENCES_JSON` is an administrator-provided JSON object, e.g.
```json
{"my-approved-skill":{"skillId":"skill_AAAA1111","version":"2"}}
```
Only an existing exact original Bot grant for slug `my-approved-skill`, a hosted sandbox grant, and a configured original PluginStore activate it. The referenced remote version must be created/owned/trusted by the operator outside this chat. No credentials are uploaded by this feature. Unconfigured mapping means no mounted provider skills.

Do NOT enable uncapped paid sessions or set `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY`. The earlier provider deployment rejected `spend_control`, so current code deliberately refuses a session rather than silently charging without a hard cap.

## What remains genuinely unresolved
- **Unrestricted hosted browser / computer use:** NOT enabled. OpenAI's hosted `computer_use` approves browser origins and sign-in, but an origin approval does NOT guarantee a separate approval for every consequential click, purchase, write or data transmission. The existing original source write policy cannot interpose before every such browser action. A trusted static read-only origin with strict network isolation could be piloted separately, or a policy-enforcing computer runtime must be used for writable destinations. Never treat prompt instructions as the security boundary.
- **Hosted vault / credentialed direct MCP:** NOT mounted. Connected, credentialed writes continue through the original source PluginStore and its explicit approval route. A fresh source grant does not authorize disclosure of secrets into a provider-managed sandbox.
- **Subagent-to-root artifact provenance:** subagent roster is real, but artifacts directly published from an uncorrelated subagent turn are NOT exposed as original root artifacts. The root must publish its own final artifact to make it source-owned and downloadable.
- **Safe retry/reopen/rollback of unknown remote effects:** no automatic retry. Cancellable root stop receipt is persisted; it is not a universal transaction rollback.
- **Live E2E:** simulator/iPhone SwiftUI build, source TypeScript, isolated PostgreSQL migrations, gateway suites, API schema compatibility, files, subagents, skills and provider cancellation need laptop/real-provider acceptance. New tests are committed, **not executed here**.
- **Production:** original Better Auth/CopilotKit cutover remains excluded. Existing dev assembly is loopback-only with fixed DEV_ACTOR, never safe for public multiuser use.

## Laptop handoff, when Section 1 verification is requested
```bash
git fetch origin
git worktree add ../EUPHORIA-SECTION1 -b validate/section1 \
  origin/feature/phase1-section1-lifecycle-20261029
cd ../EUPHORIA-SECTION1
cd openbot && bun install --frozen-lockfile
bun run --filter server typecheck
bun run typecheck:tests
bun test server/tests/managed-hosted-cancel.test.ts \
  server/tests/managed-source-skills.test.ts \
  server/tests/managed-hosted-skills.test.ts
cd ../gateway && npm ci && npm test
cd ..
swift test --package-path ios/VisualRuntimeCore
swift test --package-path ios/Spikes/A2UIRendererComparison
xcodebuild -resolvePackageDependencies -project ios/Euphoria.xcodeproj -scheme Euphoria
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria \
  -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
GitHub Actions `EUPHORIA core branch gates` handles isolated original PostgreSQL suites including `managed-hosted-cancel.integration.test.ts`. Never use a personal/production database as a test DB. Live API calls require new explicit budget authorization and compatible provider-side hard caps.

## Section 1 verdict
- **Implementation advanced**: cancellation, grants locking, version-pinned hosted skill refs, source skill reuse and native artifact preview added.
- **Not a full end-to-end pass**: hosted browser consequences, credentialed hosted vault and complete subagent/turn recovery remain outside the safe verified feature set.
- **Section 2 NOT STARTED.** Continue after an explicit handoff/decision on these remaining Section 1 boundaries.
