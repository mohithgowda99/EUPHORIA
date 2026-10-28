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
- [x] Write source-derived graph fixtures and failing tests for graph shape, bounds, shared bindings, exact context, partial revision updates and malicious structures.
- [x] Run node --test gateway/tests/a2ui-graph.test.mjs; Expected: missing graph admission fails.
- [x] Implement gateway/a2ui-graph.mjs and additive validation/normalization in visual-contract/a2ui-form; versioned contract fixture.
- [x] Run full gateway suite; Expected: all pass, existing forms unchanged.

### Task 2: Actual pending-call authorization and recovery
- [x] Failing HTTP/SQLite gateway tests for real tool argument graph, owned actions, stale calls, restart/idempotency, partial updates and cancellation. Failing AgentsClient tests for argument fingerprint mismatch and safe failure stages.
- [x] Implement gateway refresh and action integration and transport pending check, no new journal.
- [x] Full gateway suite; Expected all pass. Commit verified implementation.

### Task 3: Contracts/review and final acceptance
- [x] Provide versioned request/response/stream/recovery/permission fixtures and remaining backend roadmap.
- [x] Fresh independent Terra/medium review; one TDD important-fix pass.
- [x] Final gateway tests; coordinated native compatibility only without edits or competing executor.
- [ ] Record exact offline/live limits and unresolved historic uncertainty; commit/push assigned branch. Goal remains active for remaining services.

## Execution evidence

Baseline d66c5e0. Graph normalizer RED missing admission; loop RED embedded revision/pending argument mutation; recovery RED JSON string args and missing failure metadata; source RED root path default; review RED false200/204 acceptance and pre-fingerprint deep-tail access. All fixed; final118/118 gateway tests,71/71 unchanged Swift core tests. Temporary Swift consumer decoded versioned backend fixture, generated exact native submission from shared edits and restored one pending action. No Simulator/iOS implementation edits, no paid calls. Full provider/native graph acceptance stays unverified.

Final review: Terra/medium reviewed d66c5e0..cf1d150. Both Important findings fixed in one regression pass; no minor or declined source-behavior findings. Live provider acceptance was not judged and remains open.

Ruling: oversized/deep arguments fail502 without automatic provider refusal because an exact safe fingerprint cannot be established; no journal or external effect. Cost if wrong: provider call needs manual correction instead of automatic feedback.
Ruling: event acceptance requires HTTP202; other successful statuses remain uncertain. Cost if provider changes protocol: conservative blocked action until adapter is explicitly updated, rather than false approval.

P0 offline code path implemented, not marked fully accepted. Larger objective remains active: source parity, real task services, schedules/memory/bots/skills/integrations/permissions/collaboration, production hosting/identity/APNs/background/retention and full acceptance.
