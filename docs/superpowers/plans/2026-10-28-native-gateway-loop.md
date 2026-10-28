# Native gateway loop implementation plan

> Execute inline with Superpowers executing-plans, test-driven-development and fresh final review. User explicitly requested continued phase one without more approval checkpoints.

**Goal:** Native request, persisted validated surface, source-equivalent human reply and provider continuation through an authenticated local gateway; actual OpenAI verification remains pending credentials.
**Spec:** docs/agents/NATIVE_VISUAL_PARITY.md, docs/agents/SPIKE_HANDOFF.md and user direction.
**Architecture:** Keep the SwiftUI renderer and SwiftData archive. Add a Node HTTP gateway using the existing AgentsClient, SQLite ownership/action journal, AJV over the existing JSON Schema, and a required injected authentication verifier. The local command binds loopback and uses an explicit development bearer token; it is not production login. No cloud vendor or deployment is selected.
**Constraints:** No edits to OpenBot, no API key in the app, no arbitrary generated code, no automatic retry of unknown writes, no claim of full OpenDuet/A2UI parity. All model content validated. First tool call supports one interactive node with read-only context; multiple simultaneous decisions and page edits remain later source parity.
**Review focus:** cross-account access, concurrent duplicate actions, lost provider responses and process restart, malformed model schemas and stale revisions, local draft preservation after gateway acknowledgments.

### Task 1: Native contract boundary
Files: VisualContract.swift, VisualState.swift and core tests.
- [x] RED tests for decoded invalid schema, changed content at unchanged revision, acknowledged checklist overlays and later pending edits.
- [x] Minimal validation/reconciliation fixes; preserve valid drafts and outstanding intents; run all Swift core tests.

### Task 2: Authenticated gateway loop
Files: gateway/{package.json,package-lock.json,visual-contract.mjs,gateway.mjs,server.mjs,tests/gateway.test.mjs}.
- [x] Add AJV validator (one dependency) reusing canonical JSON Schema, plus cross-field and action validation.
- [x] RED real HTTP tests for auth, owner isolation, model surface ingestion, exact source reply shape, deduplication, stale revision, concurrent taps, lost write/no replay across database reopen.
- [x] Implement SQLite journal with synchronous transactions before provider writes, provider call mapping and revision snapshots. Acknowledged action state follows HTTP acceptance only; completed nodes stay locked; replacement model call advances revision. Unknown outcomes stay uncertain.
- [x] Native-facing routes: POST/GET /v1/sessions, GET /v1/sessions/:id (refresh), POST /v1/surfaces/:id/actions. Require auth before body/state access. Bound bodies and sanitized errors. Explicit dev-token loopback launcher; no default key or fallback provider.
- [x] Run complete Node tests; prove persisted restart and owner checks.

### Task 3: Native transport and shared renderer
Files: native GatewayClient/SessionView, existing VisualFixtureView shared renderer extraction, VisualSnapshot metadata, Xcode registration and tests.
- [x] RED URLSession contract tests for bearer/path/action payload, transport failure, invalid incoming surface. Native request id saved before transmission; do not automatically retry pending effects.
- [x] Add gateway session proof under Debug; reuse existing native controls and SwiftData snapshots. Refresh, persist-before-submit, reopen retained drafts/pending/accepted state. Display provider status honestly; no simulated output except explicitly launched QA fixture server.
- [x] Debug/Release builds, portable suite and all iOS tests. Exercise native request + returned surface + choice + revised surface + terminate/reopen against explicit local test provider.
- [x] Fresh review, important fixes RED→GREEN, update current evidence, commit locally; keep current feature branch unmerged/unpushed.

Implementation calls: SQLite is single-process local-service storage, not a declared distributed production backend. Polling authoritative session state is used before streaming (no claim of stream support). Sign in with Apple remains a candidate, not implemented login. Local personal archives stay local; active submitted content is remote service state. Cost if wrong: production scaling/auth and provider account compatibility need later qualification.

Execution evidence: TEST_EVIDENCE.md. Review added durable cancellation of unreceived submissions, explicit native recovery, inactive-call locking, session-switch/uncertainty regressions. Live execution and full phase one remain unfinished. Deferred minor: persist approval-note drafts by selected object.
