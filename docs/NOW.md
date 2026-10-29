# EUPHORIA — 29 October 2026 phase-one core continuation

**Working branch:** `feature/phase1-core-continuation-20261029`, forked from `fix/native-completed-choice-lifecycle` at `98c71ddbc3187e4d22f47409a2a674b3a4cd7e7f`. The laptop branch `codex/managed-native-execution` at `7f94d2e61eb3226dee3fffc8490b94a61ac34527`, other branches and `main` were not rewritten.

## Implemented in this continuation

- Adopted the 10 descendant commits containing source-backed completed-choice receipts and native read-only presentation by branching from the reviewed fix head. Their Mac validation remains open.
- Changed `managed_agent_inbox_turns.completed_output` to the source's Bun-safe JSONB type. Added additive migration 0071 to normalize preexisting JSONB strings to JSON objects without dropping a conversation, plus a disposable-Postgres regression test.
- A queued native decision is rechecked against its **exact** currently required provider function call. A closed action does not receive a fabricated result or automatic new model turn. The accepted original work item remains saved with an explicit recoverable error surfaced to SwiftUI, and the recovery display is linked to the latest original Inbox/root/session. Added closed-call and backward-compatible native decoding regression tests.
- Removed the hardcoded workout-choice example from the managed render-correction prompt. An invalid generated surface still receives at most one source-owned correction; this is not full A2UI support.

**Evidence boundary:** These are committed source changes, **not a completed or verified feature**. This container has no checked-out repository, Bun, PostgreSQL, macOS or Xcode, and shell access to GitHub is DNS-blocked. The connector writes and fetches remote source, but cannot run these suites. **No tests were run against this new branch, no migrations applied, no OpenAI inference invoked, and no iOS builds or deployments performed.** Older historical counts are recorded in `docs/agents/2026-10-29-managed-native-handoff.md`, never attributed to this continuation.

## Still incomplete and must not be represented as delivered

1. Original `person.question`, approval policy, source-authoritative decision and managed continuation joined end-to-end, including hours-late answers, expired-action **new authorized turn** fallback, cancellation and multiple device/tenant proofs.
2. Production `openbot/server/src/index.ts` managed cutover, real Better Auth for the managed routes, hosted HTTPS, background replica reconciliation, APNs and production deployment.
3. Source Tasks, Bot skills/grants, user connections, MCP reads/writes with pre-effect approvals, memory, tool audit and native management fully wired to managed execution.
4. Compatible `BBC6BAE9/a2ui-swift` adopted into the shipping renderer, full protocol/streaming/dynamic collections/conformance and real provider UI end-to-end.
5. Account-specific `spend_control` compatibility. The previous live API rejected the documented parameter. No new uncapped paid calls are permitted without separate authorization.

**Next gate:** On a separate Mac worktree fetch this branch, backup the real source database, verify migration 0071 only on a disposable clone, run all offline suites, then continue the four workstreams from `docs/agents/EUPHORIA_PHASE1_CORE_BUILD_HANDOFF.md`. Keep the actual `euphoria_live` database and past provider receipts intact. No main merge.
