# Live snapshot stream implementation plan

> Execute inline using Superpowers executing-plans/TDD; fresh final review with one regression fix pass.

**Goal:** Native sessions automatically follow provider changes and restore without replaying effects.
**Architecture:** Provider SSE -> coalesced canonical gateway projections -> existing native state/archive. Same journals, no event runtime/store.
**Spec:** ../specs/2026-10-28-live-snapshot-stream-design.md
**Tech:** Node fetch/HTTP/SQLite; Swift core SSE framing, URLSession, SwiftUI/SwiftData.

## Constraints/review focus

No key required for fixture implementation; no live/fake-success claims. Strict ownership/session checks, no raw event/secret forwarding, finite buffers/streams, cleanup, no stream-held mutation lock, monotonic publications, no completed-item regression, no input replay on reconnect, selected foreground session only.

### Task1 — Provider SSE transport
- [x] Add failing parser/provider transport tests, implement bounded SSE parsing and cancellable event connection.
- [x] Verify protocol URL/headers, sanitization, foreign/malformed/oversized input and cancellation.
### Task2 — Gateway live snapshots
- [x] Add failing HTTP live-feed/version tests. Implement owned/coalesced finite feed, publication sequence, identity/backpressure/shutdown cleanup using existing journal/lock.
- [x] Verify writes continue during stream, data stays sanitized and disconnection doesn't replay anything.
### Task3 — Native follow/recovery
- [x] Add failing framing/publication/final-history/native-model tests. Implement secure subscription, selected foreground lifecycle, bounded reconnect and busy-update buffering using existing state/archive.
- [x] Run all suites/Debug/Release/iOS; labelled native QA; fresh review and regression fixes.
- [x] Update NOW/parity/evidence, commit and push verified work with actual remaining gates.

## Executed result

63 gateway / 49 Swift core / 20 iOS tests pass; Debug/Release/plist gates pass. Independent review found pagination frontier and projection coherence races; fixed with failing-then-passing regressions. Coherent projection reads hold the existing per-session lock only while reading the projection, never for the subscription lifetime, so transient submitting receipts cannot enter the stream. Native draft preservation has a dedicated passing test.

Labelled local Simulator QA verified automatic choice-to-form advancement without Refresh and live resubscription/restoration after process relaunch. Further form keyboard automation was inconclusive, so a complete new manual flow is not claimed. No live provider/key/external execution; token deltas and remaining parity stay open.
