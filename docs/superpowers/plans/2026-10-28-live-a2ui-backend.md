# Live A2UI Backend Implementation Plan

> Use superpowers:executing-plans inline, TDD and one independent final review.

**Goal:** Complete bounded live graph admission and authorized continuation through existing gateway.
**Architecture:** a2ui-graph pure validation/normalization, existing visual contract and gateway journal; no iOS edits.
**Tech Stack:** Node, SQLite, node:test, existing AgentsClient.
**Spec:** ../specs/2026-10-28-live-a2ui-backend-design.md

## Global Constraints
No paid calls unless necessary; no iOS implementation edits; preserve main; no parallel store/executor; uncertain effects never replay.

## Review Focus
Shared binding alias forgery; partial update authority and cross-surface changes; provider call changes between publication and submission; restart/cancellation duplicate effects; malformed payload/resource bounds.

### Task 1: Graph admission and canonical events
- [ ] Write source-derived graph fixtures and failing tests for graph shape, bounds, shared bindings, exact context, partial revision updates and malicious structures.
- [ ] Run node --test gateway/tests/a2ui-graph.test.mjs; Expected: missing graph admission fails.
- [ ] Implement gateway/a2ui-graph.mjs and additive validation/normalization in visual-contract/a2ui-form; versioned contract fixture.
- [ ] Run full gateway suite; Expected: all pass, existing forms unchanged.

### Task 2: Actual pending-call authorization and recovery
- [ ] Failing HTTP/SQLite gateway tests for real tool argument graph, owned actions, stale calls, restart/idempotency, partial updates and cancellation. Failing AgentsClient tests for argument fingerprint mismatch and safe failure stages.
- [ ] Implement gateway refresh and action integration and transport pending check, no new journal.
- [ ] Full gateway suite; Expected all pass. Commit verified implementation.

### Task 3: Contracts/review and final acceptance
- [ ] Provide versioned request/response/stream/recovery/permission fixtures and remaining backend roadmap.
- [ ] Fresh independent Terra/medium review; one TDD important-fix pass.
- [ ] Final gateway tests; coordinated native compatibility only without edits or competing executor.
- [ ] Record exact offline/live limits and unresolved historic uncertainty; commit/push assigned branch. Goal remains active for remaining services.
