# Section 2 independent validation and repair

Approved basis: user's Sections 3–5 mission and subsequent instruction to validate completed Section 2, take ownership and integrate the product. This is implementation/validation, not a new architecture proposal. Work only in isolated `codex/section2-local-validation`, based on feature checkpoint `2fa2c1394c8c6cc6e0d407fefd98f894ffb3bb6a`; original feature branch, main and other worktrees stay untouched.

## Actual checkpoint evidence

Gateway199/199, selected managed unit37/37, source typecheck pass. Eight freshly migrated PostgreSQL databases through0075: source questions3, tasks1, MCP2, JSONB1, hosted1, cancel1, browser1, routines59 pass (69 total). Original native Debug failed: missing try in artifact routes, catch-error shadowing in Connections/Proactive/Routines/A2UI and incorrect pinned binding initializer. Compiler errors are repairable, not credentials blockers. Current remote CI action_required is not a pass.

## Independently reviewed defects

Whole feature diff reviewed by Terra/medium using requesting-code-review; reproduce/verify each finding before repair.

- [x] Reproduce old-open source run cutover. Remove the ten-minute heuristic from cutover admission, retain actual open state. Full routines60/60 after regression. Original abandonment/reaper semantics still need combined recovery audit; elapsed time is never proof of stopped external effects.
- [x] Complete native compilation repair and run Debug/Release/XCTest; preserve Section1's binding/catch fixes.
- [ ] Wire authenticated APNs device unregister before local sign-out, retain honest offline failure state and handle in-flight registration/account switch. Test exact account/token ownership and revocation ordering.
- [ ] Recover verified settled schedule creation without repeating provider POST if the process died before tool result; unknown mapping remains frozen. Test each persisted boundary and resumed original person.question result.
- [ ] Serialize manual invocation with pause/delete using the original durable routine/receipt mechanism; preserve pre-send journal and unknown-effect no-replay behavior. Controlled interleaving and restart tests, not an in-process-only mutex.
- [x] Remove temporary branch-writing formatting workflow and correct native build trigger coverage. No workflow may push a fixed collaborator branch from a PR event.
- [ ] Re-run source/lint/format, gateway, disposable DB concurrency/restart and native gates after repairs; request focused re-review of repaired findings.
- [ ] Record exact repair SHA and remaining defects in handoff; push validation branch. Do not merge until relevant findings are resolved.

## Controlled integration constraints

Section1's capability reservation under-lock expectedCapabilities/revocation test and corrected migration snapshots/journal must survive Section2 formatting churn. Review the merge diff and run both fresh and Section1-upgrade migration chains. Do not rewrite applied database stamps. Section3 remains a separate incomplete branch; retain its pinned-renderer/canonical state changes without copying whole files over conflicts.

API spend_control rejection and missing authoritative AutomationInvocation root identity stay explicit default-deny/unverified. No paid requests, recurrence, APNs credentials/public deployment, main merge or device signing are authorized here. OpenAI remains the managed execution provider; source stores provide durable product authority, not a duplicate intelligence backend.

## Repair checkpoint evidence and follow-up

Native Debug/Release pass and42/42 XCTest pass after catch-shadowing, throwing route IDs, pinned binding initializer and active-architecture test repairs. Explicit push sign-out now serializes registration, performs authenticated device DELETE, then clears the original account credentials; offline DELETE failure retains credentials. HTTP tests assert callback ordering because unsigned Simulator Keychain access is unavailable. This is not physical APNs proof.

Manual invocation now reserves source mutation exclusion and its existing receipt before external POST, settles on known response, and freezes unknown effects. Exact known-receipt repair validates manual provenance without writing deliveryStatus; existing locked sync remains the sole delivery projection.64/64 routine tests pass. Settled recurring creation can return its verified mapping without another POST, but lifecycle cases below remain open.

Independent follow-up review keeps integration HOLD for four defects: original reaper still relabels old uncertain runs skipped; expired credentials bypass explicit push sign-out; deleting schedules removes request reservation; one-time recovery revalidates time before checking settled identity. Preserve these failures as the next repair scope; do not infer integration readiness from current passing fixtures.

## Deleted approval reservation recovery

Reproduce create→confirmed provider delete→restart→replay of the exact approved request. The current hard delete removes the only durable reservation and permits another provider CREATE. Preserve a minimal tombstone in the same canonical RoutineStore row using its existing provider mutation marker (`deleted`), disabled managed execution and original request/provider identity; this avoids a second receipt database or migration-history rewrite. Ordinary source routines retain original hard-delete behavior. Hide confirmed managed tombstones from normal list/control paths and recovery scans. Saved approval continuation returns a truthful deleted result rather than retrying or reporting a live schedule. Unknown provider delete stays frozen until exact404 verification. Test ownership, wrong request identity, original source visibility, repeat deletion, restart and ambiguous-delete repair. No new paid requests.
