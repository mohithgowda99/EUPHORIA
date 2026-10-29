# Section 2 — independent Mac validation and repair checkpoint

Validated feature input: `2fa2c1394c8c6cc6e0d407fefd98f894ffb3bb6a`.
Local repair product code: `9ecc6b279e686fa1b56e871105ff7720a5a89f83`.
Branch/worktree: `codex/section2-local-validation`, `/private/tmp/euphoria-section2-review`.

**Integration HOLD. Section 2 is not accepted end to end.** The original feature branch, Section 1 evidence, Section 3 and main are untouched. No paid requests, recurring inference, APNs credentials, signing, deployment or live provider calls.

## Actual validation

At input feature SHA: server typecheck pass; gateway199/199; managed unit selection37/37. Eight fresh disposable PostgreSQL databases migrated through0075: questions3, tasks1, MCP2, JSONB1, hosted1, cancellation1, browser1, routines59 —69 passing DB cases. Historical CI was not substituted for these runs; input SHA workflows concluded action_required.

Native input SHA failed compilation. Repaired throwing artifact-route IDs, catch-error shadowing across original/native settings and routine views, and pinned binding initializer. A subsequent compiler assertion was traced to the same shadowed A2UI catch variable. Debug and Release now pass;42/42 XCTest pass,0 failures/skips, verified by xcresult. Restored Section1's active-architecture test setting; generic Debug/Release still build both Simulator architectures. Pinned resolved dependency record is committed.

After source repairs, complete routines suite64/64 (175 assertions), source typecheck pass, diff check pass. Biome scoped check exits0 but retains11 warnings/33 informational diagnostics; this is not a clean repository-wide lint claim. At the initial checkpoint, the full server sweep was not run. Current full sharded sweep against a fresh database through0075 completed:6437 pass,26 fail,19 skip across9 shards; exit1. Exact failure names/command/counts: validation/section2-20261029/full-repair-sweep.json. Migration metadata, assertion-shape, dated fixture, route DTO, managed source and proactive status tests require repair/integration diagnosis. These are failures, not skipped or waived acceptance. Upgrade from repaired Section1 history, physical-device, APNs and live-provider validation remain not run on this branch.

Exact logs and disposable database names: `/private/tmp/euphoria-section2-evidence` (`database-results.json`, per-suite migration/test logs, native RED logs, Debug/Release logs, xcresult summary). No private records/secrets are committed.

## Repairs and their limits

- A still-open source run blocks cutover regardless of age. Regression first resolved incorrectly, then refused correctly. Current reaper repair retains null status/finishedAt, annotates uncertainty once, clears the stale annotation on authoritative completion, and blocks old unresolved manual runs. Scheduled-dispatch overlap and historical rows already reaped by older code remain unresolved; this is not complete lifecycle acceptance.
- Settled approved recurring creation can recover its verified source mapping without another provider POST or a new-write spending assertion. Unknown reservations stay frozen. **Deletion remains open.** One-time recovery now parses saved identity independently of current time; new writes retain future-time bounds.
- Manual invocation persists original routine mutation exclusion and its existing receipt before external POST. Concurrent pause/delete cannot claim the routine while that mutation is unresolved. Known response settles; unknown result is not replayed. Known-receipt repair validates exact automation/session/invocation/manual provenance and retains execution unverified. Delivery status is projected only by existing locked synchronization, avoiding a second monotonic-state implementation.
- Explicit sign-out waits for pending native registration, revokes the authenticated original device, then clears its original saved credentials. Failed/unconfirmed revocation retains credentials and explains the failure.42-test suite includes exact authenticated DELETE and credential-clear callback order/failure. Unsigned Simulator Keychain access failed in the first test attempt; the tests now isolate credential-clearing side effects through an explicit callback and do not claim physical Keychain/APNs acceptance. **Expired-sign-in cleanup remains a separate unresolved path.**
- Removed PR-triggered workflow that could push a fixed feature branch; removed native compile workflow's file-only path filter so Swift changes trigger validation.

## Independent review and remaining important defects

Terra/medium reviewed the entire79-file feature diff and the repair diff. Findings below remain open; the reviewer explicitly did not approve integration:

1. Source uncertainty: the age-based reaper bypass and old manual admission are repaired and re-reviewed.94/94 store/sweep/liveness cases (322 assertions), source typecheck and scoped Biome pass (22 informational diagnostics). Logs reaper-red.log, reaper-review-red.log, reaper-manual-red.log and reaper-final-affected.log retain RED/GREEN evidence. One intermediate all-store run hit a5-second cap-test timeout; subsequent full runs passed, evidence retained. Combined111-case run also exposed2 unchanged GET routine DTO tests expecting no cron/backend fields:109 pass,2 fail, recorded in reaper-combined.log. Do not weaken those assertions; reconcile original/native contract in subsequent integration. Scheduled dispatch retries/overlap and historical legacy-reaped records remain open; old terminal rows cannot be reclassified as safe by this patch. Existing databases need conservative inventory/guard before managed cutover.
2. Expired credentials in `SourceBotsView` clear authentication without server device revocation. Old-owner notification registration can survive, and account switching can fail ownership checks. Offline revocation cannot be guaranteed; fix the actual source/device/session lifecycle and payload privacy, not just the explicit button.
3. Routine deletion erases the only approved-request reservation. Retrying that original approval can recreate a deleted schedule. Retain idempotency evidence in an appropriate existing durable source authority beyond deletion.
One-time recovery finding repaired and re-reviewed: exact saved approval and existing provider/source mapping survive restart after the original run time. New stale proposals still fail before provider POST. Fresh DB migration through0075 and real question/approval/restart fixture:1/1 (12 assertions); proposal unit7/7 (38 assertions), complete routine suite65/65 (178 assertions), server typecheck pass. Scoped Biome exits0 with53 warnings/70 informational diagnostics. Logs: elapsed-final-source.log, elapsed-parser-final.log, elapsed-routines-final.log, elapsed-types-final.log and elapsed-biome-fixed.log in the evidence directory.

Manual projection/provenance finding was re-reviewed and closed: repair no longer writes delivery status, exact receipt/manual checks remain, sync is the sole projector. Other fixes are narrower than full lifecycle acceptance.

## Integration dependencies and next step

Preserve Section1's under-lock capability-revocation reservation check/test, corrected migration metadata, API skill contracts, source compilation and native fixes when reconciling Section2 formatting churn. Section3 current branch is separately incomplete and adds native composition support; no merge has occurred.

**Next:** reproduce and repair the three remaining lifecycle findings, add restart/concurrency negative tests and re-review before controlled integration. Then validate fresh and upgraded migration chains and the inherited full-server failures. Provider hard spending enforcement and authoritative scheduled root correlation remain unresolved default-deny/unverified external boundaries, not excuses for code defects.
