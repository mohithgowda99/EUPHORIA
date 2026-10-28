# Managed native cutover implementation plan

> Use superpowers:executing-plans inline; one independent whole-change review.

Goal: connect existing source services to managed execution and prove a complete native journey.
Architecture: existing source identity, ChannelStore, Inbox and WorkQueue remain authoritative; existing Agents transport handles provider calls. Native UI uses original service routes. No new execution framework without a demonstrated gap.
Spec: ../specs/2026-10-28-managed-native-cutover.md

- [ ] Validate newest source, gateway and native baseline; correct actual build/fixture failures.
- [ ] Apply versioned stable prompt sections, supported reasoning/verbosity and usage observations. Preserve history and schemas; do not send unsupported cache controls.
- [ ] Wire managed source submission, exact-turn completion and recovery into original delivery behind explicit configuration; preserve grants and uncertain outcomes.
- [ ] Connect native interactive content and source motion; test save/reopen and correction.
- [ ] Run source/gateway/core/Debug/Release/native checks, independent review, then bounded live proof if configuration permits. Record remaining blockers honestly; push feature branch only.

Review focus: lost submission/stream; foreign or revoked source identity; simultaneous messages; restart before reply; user-visible interaction and reopening.

Baseline: source typecheck passes; gateway has one stale JSON-vs-SSE fixture failure; source tests have two incorrect fixture/expectation failures. Swift core76 pass. Native build fails guard trailing closures and escaped key path. Fix existing evidence before activation.

## Checkpoint 29 October

Execution stopped at the user-requested commit/push checkpoint. Baseline, prompt/settings, loopback source integration and a first native Chat port are implemented; full production cutover/fidelity and long-wait interaction are not complete. Offline gates passed; one natural request + native choice continued through the real provider in one authorized session, after two failed/diagnostic roots. See `docs/agents/2026-10-29-managed-native-handoff.md` for all evidence and remaining tasks. Do not mark the full plan/phase complete.
