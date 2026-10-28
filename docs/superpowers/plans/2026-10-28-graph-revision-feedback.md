# Graph revision feedback implementation plan

Use Superpowers executing-plans inline and TDD.
Spec: ../specs/2026-10-28-graph-revision-feedback.md

- [x] RED gateway test: graph result includes correct authoritative metadata and can drive next partial call.
- [x] RED disk journal test: exact outgoing event (timestamp and metadata) exists before provider write and survives restart; legacy rows remain NULL.
- [x] RED stale revision feedback/mutated refusal fingerprint tests.
- [x] Implement graph-only envelope and additive result journal, preserve legacy source event.
- [x] Implement bounded stale-call correction and exact rejection guard.
- [x] Full gateway suite, independent review and one regression fix pass; versioned contracts/fixtures.
- [x] Commit/push verified slice; keep full goal active.

Evidence: RED /private/tmp/euphoria-feedback-red.log and review RED /private/tmp/euphoria-feedback-review-red.log. GREEN full124 tests /private/tmp/euphoria-feedback-final.log. Terra/medium independent review2 Important findings; both fixed with regression; no minors. Native implementation untouched; no paid calls. Chosen additive provider-only metadata preserves source event and avoids extra inference/read-tool cycles. Historical uncertainty remains unclassified. Full product goal not achieved.
