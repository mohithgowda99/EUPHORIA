# Section 3 Native A2UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing authenticated native visual path into a reusable, persistent interactive A2UI experience with measured pinned-protocol coverage and honest unsupported states.

**Architecture:** Retain original source authority, the existing gateway admission contract, VisualState/SwiftData drafts and the pinned native A2UI renderer. Extend these boundaries together; provider UI output does not grant tool authority. Do not add an agent runtime, parallel renderer, domain-specific screen architecture, scheduler or credential store.

**Tech Stack:** SwiftUI, SwiftData, pinned A2UI Swift revision 16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0, existing JavaScript gateway/Bun source server and PostgreSQL.

## Authority and baseline

The user's 29 October Sections 3–5 implementation mission is the approved specification. Section 3 begins on `codex/section3-native-a2ui` in `/private/tmp/euphoria-section3-native`, a clean pre-created worktree at validated Section 1 `32ae2fb516122d6e7ac788013f09a3c3a6fb1763`. Main, normal checkout, Section 1 evidence and Section 2 remain untouched.

Baseline executed: gateway 196/196, Swift core 76/76. Known full-server eight failures remain open and must be addressed during integration. Section 2 current `7f7a5aa830d289622143595a808b3ba0f6194781` has cancelled latest core/repository CI and a partial handoff; inspect/revalidate before Stage B. No paid calls, production changes or uncontrolled recurrence.

## Task 1: Display-only graph lifecycle

Files: gateway/a2ui-graph.mjs, gateway/visual-contract.mjs, gateway/gateway.mjs, gateway/tasks.mjs; VisualContract.swift and VisualState.swift; corresponding gateway/Swift/source integration tests.

- [x] RED: a read-only graph must admit without a fake Button, receive a shown receipt, complete, preserve source ordering and reopen. A button-bearing graph must still reject a display-only receipt.
- [x] Extend existing shared action classification in JS/Swift and reuse it in pending/resolved/task projections. Preserve idempotency, revision and stale-action rejection.
- [x] GREEN: run targeted gateway/Swift tests, then complete suites. Add routed original-source fixture coverage before claiming source acceptance.
- [x] Commit the verified lifecycle increment.

## Task 2: Pinned protocol/catalog coverage

Files: gateway/a2ui-graph.mjs and contract schemas; A2UIComposition.swift; A2UIProjectionBridge.swift; native renderer bindings; protocol and cross-domain fixtures/tests.

- [ ] Audit all 18 pinned standard component decoders, 25 function registrations, server/client messages and actual SwiftUI rendering; write an explicit coverage matrix.
- [ ] RED/GREEN each supported component/property, dynamic binding, layout/container child relation and input constraint at gateway and Swift boundaries. Include invalid/unsafe inputs, not just examples.
- [ ] Extend existing renderer subscriptions and source-validated action adapter for admitted controls. Keep dynamic scripts/network/unknown catalogs unsupported rather than silently flattening.
- [ ] Verify upstream differential decoding with the same synthetic fixtures; distinguish protocol semantics, application policy limits and upstream limitations.
- [ ] Commit independently verified increments; no new domain-specific solution.

## Task 3: Incremental updates and persistence

Files: existing graph operations, VisualState reconciliation, SwiftData snapshots, source visual continuation and native engine projection; relevant tests.

- [ ] RED/GREEN creation/update/deletion, valid-prefix progressive rendering, atomic invalid update refusal, stale revisions, local draft preservation and exact identity continuity.
- [ ] Test multiple unrelated planning, data exploration, tasks, research and decision requests using real source records and deterministic providers.
- [ ] Validate message/interface/action ordering, process termination/relaunch, saving/reopening and authorized sharing. Unknown provider writes remain unreplayed.
- [ ] Commit the lifecycle implementation and tests.

## Task 4: Native integration/craft and milestone acceptance

Files: existing native conversation/gallery/workspace interfaces and reusable presentation primitives only as needed; docs/agents/EUPHORIA_SECTION3_HANDOFF.md and docs/NOW.md.

- [ ] Apply existing native design language with supported responsive layouts, clear loading/empty/failure states and reduced redundant metadata. Preserve source conversation/permissions/files/tasks.
- [ ] Run source typechecks and relevant format/lint checks, gateway HTTP mocks, isolated PostgreSQL/source negative/concurrency/restart tests, Swift packages, Xcode Debug/Release/XCTest and actual Simulator actions/restoration.
- [ ] Resolve introduced failures; retain inherited failures and unsupported protocol cells explicitly. Never treat fixture inference as live verification.
- [ ] Obtain one independent whole-milestone review (Terra/medium per project preference), repair important findings, rerun affected gates.
- [ ] Commit/push Section 3 with coverage, screenshots, exact code HEAD and blockers; preserve it if Section 2 is still moving.

## Subsequent milestones

Stage B starts only after current Section 2 review/local checkpoint. Use a fresh integration branch; deliberately merge required changes, test both migration histories through 0074/0075, then implement source memory retrieval/control and complete TaskStore continuity. Stage C integrates native navigation and per-user production server execution, removes only proven redundant legacy execution dependencies, validates cross-section recovery and produces EUPHORIA_FULL_PRODUCT_VALIDATION.md. Provider budget and automation-root gaps must remain disabled/unverified unless a documented safe resolution is established. Each stage gets its own executable plan after inspection; no speculative architecture is selected here.
