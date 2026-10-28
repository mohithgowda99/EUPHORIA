# Routine firing slice

AgentA backend, AgentB isolated native workstream per new clarification. Source openbot/shared/routine-firing.ts and server/src/routines/{schedule,sweep}.ts plus docs/routines.md. Reuse pinned cron-parser5.10.0; strict five fields, valid IANA timezone, fixed200-occurrence15min floor plus runtime pair backstop; max20 enabled per owner.

CRUD owner-scoped routine metadata with optimistic revision; SQLite occurrence journal claims due minute and advances next stamp in one transaction before dispatch. Existing tasks.start and creation journals perform actual hosted session creation; no second tool/run executor. Preserve original standing instruction; frame only firing input so model performs work rather than creates another routine. Missed windows older10min skip to current next stamp without paid catchup. Concurrent/restart sweeps cannot submit same occurrence twice. Claimed crash/uncertain dispatch is not replayed; audit remains unknown. Missing worker heartbeat exposed, never label dispatch as successful execution. Optional server timer must be explicitly enabled; no paid work in tests.

This vertical slice implements schedule-to-existing-task dispatch, not full source routine outcome/fatigue/channel/grants/tool parity. Those remain required next work, as do managed hosting and actual-provider/native acceptance. No ios files touched.
