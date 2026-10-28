# EUPHORIA Agents gateway

Native phase-one connection proof, not complete OpenDuet parity or production infrastructure. Node24+ (`node:sqlite`), AJV over the existing native JSON Schema, and built-in HTTP/fetch. Existing OpenBot remains untouched.

## Verify

```sh
npm ci --prefix gateway --ignore-scripts
node --test gateway/tests/*.test.mjs
```

28 tests use a local provider or HTTP stub, not OpenAI. The real `AgentsClient` targets the official Agents API with its beta header. It never automatically retries writes and handles empty202 acceptance separately from completion.

## Run with a real provider

Configure these as **server process secrets/settings**, then run from the repository root:

```sh
node gateway/server.mjs
```

Required environment: `OPENAI_API_KEY`, explicit `EUPHORIA_MODEL`, and `EUPHORIA_DEV_TOKEN` (at least32 characters). Optional: `EUPHORIA_STATE_DIR`, `EUPHORIA_PORT` (default8787). Nothing prints credentials. The launcher binds127.0.0.1 only. It uses development identity and is not production Sign in with Apple, a public proxy or a phone-independent deployment. Real OpenAI access is unverified until a key is available.

In the iOS Debug scheme's launch environment set `EUPHORIA_GATEWAY_URL` to the development gateway URL and `EUPHORIA_GATEWAY_TOKEN` to the development token. Open **Visual contract proof → Open gateway session**. The app receives no OpenAI key. Local HTTP is permitted only for an explicitly enabled loopback connection. Release does not enable this Debug connection UI or local ATS exception.

## Explicit native QA only

```sh
node gateway/tests/native-fixture-server.mjs
```

This deliberately labelled fixture binds127.0.0.1:8788, using the non-secret test token `euphoria-explicit-local-fixture-token`. It returns choice → form → approval → shared gallery/isolated artifact → shown receipt. It also exposes labelled conversation/history/cancel fixtures and performs no inference or external effect. Configure the Debug scheme for that address/token. The app displays **Local test provider — no model inference**. This fixture is never selected by the real server and is not an inference fallback. State lives in a temporary directory printed at launch.

## Implemented boundary

- All routes require an injected authentication verifier before accessing state. Local launcher uses a constant-time development-token comparison. Native production login, token verification and cloud deployment remain pending.
- `POST /v1/sessions` accepts `{id,message}`; an owner-scoped creation journal is written before the provider call. `GET /v1/requests/:id` recovers creation state. `DELETE` atomically records cancellation only for an unreceived request, blocking late delivery of the same ID; accepted/uncertain creates remain accepted/uncertain.
- `GET /v1/sessions` lists only owned sessions. `GET /v1/sessions/:id` retrieves current provider required actions, validates their surface, and assigns gateway-owned identity/revision. This is manual snapshot refresh, not streamed history replay.
- `POST /v1/surfaces/:id/actions` checks owner, revision, current active decision, exact action schema and source-equivalent result. It journals before provider submission. Unique call/action constraints plus serialized per-session operations prevent concurrent duplicate sends. Unknown outcomes survive restart and are not replayed.202 means accepted, not completed.
- `POST /v1/surfaces/:id/reconcile` accepts `{pendingActionIDs:[...]}` and records cancellation for unreceived intents before returning `rejectedActionIDs`. Known uncertain writes stay blocked; resolution does not execute or resend them. Native code removes only server-rejected/acknowledged queued intents.
- One active choice, form or approval per function call, with optional read-only context. Version 2 also supports typed gallery/HTML-only results with a shown receipt. HTML execution is native-app-isolated, offline, and has no native tool authority. Full basicCatalog, editable pages, dynamic grants, bots, files, integrations and routines remain source-parity work.
- Conversation routes: POST sessions/:id/messages or /cancel; GET sessions/:id/inputs; POST sessions/:id/inputs/reconcile. Same journal/ownership rules apply. Definitive provider rejections are terminal; unknown effects stay uncertain and are not resent.
- GET sessions/:id/items supports bounded newest-first provider pages with after cursor. Native pages return chronological entries and order=desc. Known message/tool/surface projections only; unsupported raw tool data is not exposed. A UI approval is a response, never a business-effect executor.

SQLite is a single-process local service journal, with owner/session mapping, active submitted surfaces and action receipts. Personal archives stay on-device; submitted model context and provider history are remote processing. Store directory/DB are private locally; deployment encryption, quotas, retention/deletion, production identity, streaming, webhooks and distributed concurrency are not qualified. Action journal limit500 per session. Provider-outcome reconciliation for genuinely uncertain writes still requires authoritative evidence; there is no unsafe retry button.

Protocol references checked2026-10-28:
- https://developers.openai.com/api/docs/guides/agents-api/quickstart
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/events/methods/create

## Source A2UI form adapter

The existing `euphoria_render_surface` function also accepts `{a2ui:[...]}` with source v0.9 createSurface/updateComponents/updateDataModel messages. The supported shape is the source-tested Card → Column → heading/1–8 shortText or longText fields/one event Button. Flat string paths only; unsupported catalog features fail explicitly. See `tests/fixtures/a2ui-trip-v09.json` and the [adapter design](../docs/superpowers/specs/2026-10-28-a2ui-form-adapter-design.md).

The adapter publishes canonical native askForm data. Submitted edits preserve empty strings and whitespace and produce a source userAction event with resolved context and a once-assigned timestamp. Existing ownership, revision, exact call/turn IDs and journal/idempotency rules apply. No React/A2UI runtime dependency is added to the iOS app. This is partial form conformance, not full A2UI support.
