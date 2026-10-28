# Routine dispatch plan

Use Superpowers executing-plans/TDD; spec ../specs/2026-10-28-routine-dispatch.md.
- [x] RED clock/HTTP/disk tests: schedule floor/timezone, creation/edit/cap/ownership, actual framed task dispatch, duplicate/restart, skipped backlog, worker heartbeat.
- [x] Implement bounded cron schedule and SQLite routine occurrence claims through existing task service.
- [x] Explicit opt-in launcher timer; failure contained, no implicit inference on import.
- [x] Independent review and important regression fixes; full gateway suite.
- [x] Versioned contract/fixtures/context; commit/push assigned backend branch.

Evidence: initial RED /private/tmp/euphoria-routines-red.log; review RED /private/tmp/euphoria-routines-review-red.log; prior-shutdown-behavior RED /private/tmp/euphoria-routines-shutdown-red.log, reproduced with finally-restored code. One baseline deferred-stub and repeated-close cleanup issue stalled owned runners; only their confirmed PIDs were stopped; test cleanup fixed, full final run passed. No paid/native calls.

Independent Terra/medium review:3 Important findings fixed with regressions (claim-time freshness, exact task linkage, graceful shutdown). Conditional multi-process finding ruled against unsupported runtime: one process per SQLite file remains explicit. Cost if deployed as shared-file replicas: caps/revisions/recovery unsafe; managed deployment must address before scaling. No claim of distributed correctness.

Dispatch acceptance is not successful execution; source fatigue/outcome/grants/channel behavior and native/provider/cloud acceptance remain open. Larger objective stays active.
