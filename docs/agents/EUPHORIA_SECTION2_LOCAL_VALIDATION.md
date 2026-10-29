# Section 2 — independent Mac validation and repair checkpoint

Validated feature input: `2fa2c1394c8c6cc6e0d407fefd98f894ffb3bb6a`.
Local repair product code: `9ecc6b279e686fa1b56e871105ff7720a5a89f83`.
Branch/worktree: `codex/section2-local-validation`, `/private/tmp/euphoria-section2-review`.

**Integration HOLD. Section 2 is not accepted end to end.** The original feature branch, Section 1 evidence, Section 3 and main are untouched. No paid requests, recurring inference, APNs credentials, signing, deployment or live provider calls.

## Actual validation

At input feature SHA: server typecheck pass; gateway199/199; managed unit selection37/37. Eight fresh disposable PostgreSQL databases migrated through0075: questions3, tasks1, MCP2, JSONB1, hosted1, cancellation1, browser1, routines59 —69 passing DB cases. Historical CI was not substituted for these runs; input SHA workflows concluded action_required.

Native input SHA failed compilation. Repaired throwing artifact-route IDs, catch-error shadowing across original/native settings and routine views, and pinned binding initializer. A subsequent compiler assertion was traced to the same shadowed A2UI catch variable. Debug and Release now pass;42/42 XCTest pass,0 failures/skips, verified by xcresult. Restored Section1's active-architecture test setting; generic Debug/Release still build both Simulator architectures. Pinned resolved dependency record is committed.

After source repairs, complete routines suite64/64 (175 assertions), source typecheck pass, diff check pass. Biome scoped check exits0 but retains11 warnings/33 informational diagnostics; this is not a clean repository-wide lint claim. Full server sweep, upgrade from the repaired Section1 database history, physical-device, APNs and live-provider tests remain not run on this branch.

Exact logs and disposable database names: `/private/tmp/euphoria-section2-evidence` (`database-results.json`, per-suite migration/test logs, native RED logs, Debug/Release logs, xcresult summary). No private records/secrets are committed.

## Repairs and their limits

- A still-open source run blocks cutover regardless of age. Regression first resolved incorrectly, then refused correctly. **Original source reaper can still mark it skipped by age; that remaining bypass is not fixed.**
- Settled approved recurring creation can recover its verified source mapping without another provider POST or a new-write spending assertion. Unknown reservations stay frozen. **Deletion and one-time time-window cases remain open.**
- Manual invocation persists original routine mutation exclusion and its existing receipt before external POST. Concurrent pause/delete cannot claim the routine while that mutation is unresolved. Known response settles; unknown result is not replayed. Known-receipt repair validates exact automation/session/invocation/manual provenance and retains execution unverified. Delivery status is projected only by existing locked synchronization, avoiding a second monotonic-state implementation.
- Explicit sign-out waits for pending native registration, revokes the authenticated original device, then clears its original saved credentials. Failed/unconfirmed revocation retains credentials and explains the failure.42-test suite includes exact authenticated DELETE and credential-clear callback order/failure. Unsigned Simulator Keychain access failed in the first test attempt; the tests now isolate credential-clearing side effects through an explicit callback and do not claim physical Keychain/APNs acceptance. **Expired-sign-in cleanup remains a separate unresolved path.**
- Removed PR-triggered workflow that could push a fixed feature branch; removed native compile workflow's file-only path filter so Swift changes trigger validation.

## Independent review and remaining important defects

Terra/medium reviewed the entire79-file feature diff and the repair diff. Findings below remain open; the reviewer explicitly did not approve integration:

1. Source reaper in `routines/store.ts` relabels abandoned/old work skipped without authoritative cancellation. Cutover must preserve uncertainty even after reaping. Do not fabricate a terminal outcome from elapsed time.
2. Expired credentials in `SourceBotsView` clear authentication without server device revocation. Old-owner notification registration can survive, and account switching can fail ownership checks. Offline revocation cannot be guaranteed; fix the actual source/device/session lifecycle and payload privacy, not just the explicit button.
3. Routine deletion erases the only approved-request reservation. Retrying that original approval can recreate a deleted schedule. Retain idempotency evidence in an appropriate existing durable source authority beyond deletion.
4. One-time recovery validates future execution time before checking settled request identity. Recovery later in time can strand a verified creation. Separate immutable request identity from new-write time admissibility.

Manual projection/provenance finding was re-reviewed and closed: repair no longer writes delivery status, exact receipt/manual checks remain, sync is the sole projector. Other fixes are narrower than full lifecycle acceptance.

## Integration dependencies and next step

Preserve Section1's under-lock capability-revocation reservation check/test, corrected migration metadata, API skill contracts, source compilation and native fixes when reconciling Section2 formatting churn. Section3 current branch is separately incomplete and adds native composition support; no merge has occurred.

**Next:** reproduce and repair the four remaining lifecycle findings, add restart/concurrency negative tests and re-review before controlled integration. Then validate fresh and upgraded migration chains and the inherited full-server failures. Provider hard spending enforcement and authoritative scheduled root correlation remain unresolved default-deny/unverified external boundaries, not excuses for code defects.
