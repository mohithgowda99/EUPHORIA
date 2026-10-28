# EUPHORIA Visual Runtime, parity and gateway contract (design spike)

Status: **source-backed capability inventory + five-node native renderer proof, NOT full feature parity or live Agents API integration.** Reviewed OpenDuet baseline `5b0e15f9719db0628c02a3fe6386dcad683c8302`; starting native foundation `ba91291e75b84c71e18a00edec2db42f079cf4a5`. CopilotKit implementation remains untouched. Canonical route inventory: `docs/ios/FEATURE_PARITY.md` (79 TSX route files, including layouts). This specification extends, rather than silently replaces, that ledger.

## Mapped contracts from source

| Contract family | Exact source reference | Behavioral contract | Native milestone |
|---|---|---|---|
| A2UI primitives | `app/src/lib/copilot/a2ui.tsx` | `Catalog` wraps CopilotKit `basicCatalog`; SDK owns data bindings, actions, component schema; gated by `a2uiProviderOptions` | **unimplemented**: inventory full basicCatalog types, action/data binding model and conformance fixtures before declaring A2UI support |
| HTML Generative UI | `app/src/lib/copilot/generative-ui.ts`, `provider.tsx` | `openGenerativeUI` design skill; sandboxed iframe HTML/JS/CSS; no same-origin session/fetch; theme message channel | **unimplemented**: independent WKWebView sandbox, isolated origin, disallow API access, explicit permissions + CSP; not native A2UI |
| Gallery registration | `app/src/lib/copilot/gallery-registry.ts` | Modules export `GALLERY`: `name`, `title`, `kind` chart/card/decision, `description`, `parameters`, `preview`, `Component`, optional `confirmation`/`reads`; sorted stable registry | **partial**: only five native fixture nodes; no dynamic server-published registry |
| Gallery governance | `gallery-tools.tsx` | Per-active-Bot grant and published description; forbidden components return NOT_SHOWN; revocations override rendering; decisions use `useHumanInTheLoop` and must resolve with denial | **unimplemented**: server-owned component catalog, per-person/Bot grants and denial history |
| Browser-authored sandbox | `sandboxed-tools.tsx` | Published argument JSON schema, runtime `html/css/jsFunctions`, per-call IDs and renderability; fallback/refusals; dedicated sandbox | **unimplemented**: no silent native substitution |
| Read-only gallery cards | `gallery/cards.tsx` | `showRecord`, `showMetrics`, `showChecklist`, `showNotice` return confirmation; `showChecklist` explicitly **cannot be ticked** | **partial**: native read-only checklist, no confirmation sent |
| Graphs | `gallery/charts.tsx` | `showBarChart`, `showPieChart`, `showLineChart`, `showAreaChart`, `showProgress`; typed data, labels and formats | **unimplemented**; not generic chart placeholders |
| Data table | `gallery/table.tsx` | `showTable` typed columns/rows and display rules | **unimplemented** |
| Human decisions | `gallery/decisions.tsx` | `askChoice` returns `{choice:id,label}`; `askApproval` returns `{decision:"approved"|"declined",note?}`; suspend run until `respond`, completed cards are noninteractive | **partial**: native schema validation, queued choice/approval; remote suspend/resume unimplemented |
| Form HITL | `gallery/form.tsx` | `askForm` <=8 unique field IDs (`^[A-Za-z][A-Za-z0-9_]{0,47}$`), text/email/number/select/textarea, bounds, required, select uniqueness; returns `{status:"submitted",values:{...}}` with numeric values as numbers; `invalid` response for invalid schema | **partial**: typed validation/drafts/pending submission, not remote tool result |
| Page blocks | `components/duet/page-view.tsx`, `page-rich-block.tsx`, `lib/pages/queries.ts` | text/heading/metrics/bars/image/slide/timeline/decision/checklist/table/comparison, callback `onCheck(persistedIndex,item,checked)`; list tap may send a user turn | **partial**: checklist state only, not full page block schema |
| Task artifacts | `page-card-tool.tsx`, `task-card-tool.tsx`, `offer-task-tool.tsx`, `morning-brief-tool.tsx`, `reply-chips-tool.tsx` | Source-origin cards and interaction routing; task lifecycle and confirmations are server state | **unimplemented** |
| Bot/skill editing | `bot-tools.tsx`, `skill-tools.tsx` | `list_bots`, `read_bot`, `list_bot_skills`, `save_bot` (HITL); `list_skills`, `read_skill`, `list_skill_tools`, `save_skill` (HITL), grant-gated | **unimplemented**; service, policy and schema translation required |
| Computer write approvals | `approval-tools.tsx`, `computer-tools.tsx` | mutating `computer_click/type/key/run_command/write_file` POST `/api/approvals/computer/:botId`; 202 stops current run; only server executes/resumes; client never double-runs effect | **unimplemented**; cloud tool service and durable audit needed |
| Browser/computer read | `computer-tools.tsx` | `computer_navigate/read/snapshot/request_secret/request_help/list_files/read_file/scroll`, with specific permission and origin rules | **unimplemented**; no personal computer needed for some hosted operations but not behaviorally equivalent |
| Conversation & history | `conversation.tsx`, `bot-thread.ts`, `thread-messages.ts`, `repair-history.ts` | transcript tools submit a user turn, storage per Bot, durable thread and replay of rich tool state | **unimplemented**: bind Agents session and EUPHORIA surface stream; preserve exact tool/result pairs |
| Data, permissions, routines | `server/src/app.ts` and `routes/*`, `server/src/approvals/*`, `server/src/memory/*` | auth, session ownership, memory provenance, integrations, channels, groups, routines, audit and admin | **unimplemented** serverless product services |

Gallery names are a source snapshot, **not the entire CopilotKit A2UI basic catalog**. Generated tool/page/computer state not enumerated above remains a required source-by-source parity task; do not mark any row green until tests reproduce each meaningful interaction.

## Versioned native UI protocol v1 (implemented subset)

`VisualSurface {schemaVersion:1,surfaceID,revision,nodes:[VisualNode]}` with **explicit** `kind` discriminant (`askChoice`, `askForm`, `askApproval`, `showChecklist`, `pageChecklist`), stable IDs, typed fields/options/items. Validate schema version, limits, duplicate IDs, option membership, form bounds. Unknown kinds fail decoding; never execute unknown payloads. No HTML/JS or remote Swift type names enter this contract. This is an **EUPHORIA adapter format**, not a claim that Agents API or CopilotKit emit it natively.

`VisualAction {id:UUID,surfaceID,expectedRevision,nodeID,kind,values:[String:VisualScalar]}`; scalar encodes as JSON string/number/bool. `setField` is locally persisted draft, **not** an externally submitted event. `choose` yields `{choice,label}`; `decide` yields `{decision,note?}`; `submitForm` internally queues typed values, gateway translates into exact OpenDuet `{status:"submitted",values}`; `toggle` yields `{item,checked}` only for editable `pageChecklist`. `showChecklist` always refuses toggle. `VisualState {surface,values,pending}` persists all pending events and drafts. A local event doesn't advance the server revision. Only an authenticated gateway acknowledgement can clear a pending action and accept a new revision. Duplicate/stale actions rejected. Source fixture page checklist is a minimal *interaction analogue*, not exact `PageBlock` parity.

**Intent/outcome separation:** Native input creates an intent; the gateway validates ownership, grant, tool state, current expected revision and idempotency key, then invokes OpenAI function tool response or submits a user input event. An agent-generated replacement surface is a **distinct authority-bound result** with incremented revision and `acknowledgedActionIDs`, never assumed on local tap. A UI approval is never itself proof that a bank, browser or computer mutation executed. High-impact effects require product-specific policy and server-mediated approval; no local retries can replay them.

For v2, implement typed layout tree and stable binding IDs after source A2UI catalog audit; schema migrations must be explicit (`schemaVersion` compatibility window, server-side upgrade and read-only fallback). Unknown renderers should be presented as unsupported, preserving raw state safely and avoiding tool execution. In V1 unknown kinds are rejected rather than dropped.

## Gateway boundary (local single-process subset implemented; production deployment pending)

- `POST /v1/sessions` authenticates EUPHORIA identity, enforces quotas, creates OpenAI Agents API session, persists owner/session mapping; never forwards API credentials to iOS.
- `GET /v1/sessions/{id}` and `GET /v1/sessions/{id}/events` verify per-user ownership; stream sanitized Agents event envelopes, preserve event/item IDs and real turn status. On disconnect, reread authoritative Agents session/items and reconcile; streams have no full event replay.
- `POST /v1/surfaces/{surfaceID}/actions` checks **user, session, tool grant, surface revision, pending tool call, action UUID** transactionally. For HITL response, submit `agent.session.input.tool_result` with provider `turn_id` and `call_id`; do not guess or manufacture those IDs. Respond `{surfaceID,acceptedActionID,revision,phase}` only after durable write/valid provider submission. For page edits, use authorized user message or tool output with new state; don't silently reinterpret them as a raw tool result.
- `GET /v1/surfaces/{surfaceID}` returns authoritative revision + persisted visual snapshot and action acknowledgments; reconcile local SwiftData drafts/pending events after relaunch.
- `POST /v1/approvals/{id}/decision` validates signed-in user, scope and durable decision state; action executor must be idempotent and only run once after approval. Server stores denial/execution audit.
- OpenAI webhooks verify signature, map session -> owner, fetch current required actions/turn results before mutating product state, enqueue APNs notification with minimal data. Schedule via Agents API automations, map automation to user/session, enforce authorization before creation and edits.

**OpenAI verified protocol refs (2026-10-28):**
- Sessions, streams, item history, idempotent messages, cancel: https://developers.openai.com/api/docs/guides/agents-api/sessions
- Function tool pending `required_actions`, result `agent.session.input.tool_result`: https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- Stream event IDs, results, missed-event reconciliation: https://developers.openai.com/api/docs/guides/agents-api/sessions/events
- Signed session webhooks and required actions: https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks
- Automations: https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/automations/methods/create

**Risks:** Function tools require service-side work while an agent is waiting; serverless execution durations, retries and webhook concurrency must be engineered. The `agent.session.requires_action` notification isn't the action payload; fetch `required_actions`. Stored OpenAI items alone don't guarantee a surface-revision log. Agent turn `completed` is not proof all tools succeeded. For hosted browser actions, product approval and access policy must be enforced independently. SwiftData is local cache; a separate persistent cloud database is necessary for owner mapping, approvals, outgoing actions and unattended notifications. No credentials, raw cookies, join tokens, PII or user prompts in committed fixtures/traces.

## Acceptance ladder and current test evidence

- **Core-only local proof**: `cd ios/VisualRuntimeCore && swift test --jobs 2` on Linux Swift 6.2.1. **8 XCTest cases, 0 failures**, source fixture kinds, form type conversion, gating/read-only split, duplicate choice, approval queue, Codable relaunch snapshot, stale revision, invalid kind/version. Actual local command was run.
- **Executed on macOS 2026-10-28**: Debug/Release builds and built-plist checks; nine iOS XCTest including on-disk SwiftData container reopen; native fixture draft and queued choice survived app termination/relaunch. Eight portable Swift tests and twelve internal provider adapter tests also passed. See `TEST_EVIDENCE.md` for exact scope.
- **Not executed**: live Agents API session, streamed native surface, genuine tool `required_actions`, gateway, cloud revision ack, webhooks/APNs, schedule, cross-user authorization. No real token or endpoint provided and no live integration attempt made.

## Next executable vertical slice (live proof deferred until key availability)

1. **Partially verified:** Debug/Release +9 XCTest, native choice/form draft termination/relaunch passed; editable checkbox manual re-entry remains unchecked. Internal server-side provider transport is tested locally; not yet connected to native UI.
2. In separately deployed gateway, provision OpenAI key as server secret, create a genuine managed session with no environment and source-based **function tool** `euphoria.render_surface` that returns schemaVersion=1 data; persist owner/session/surface.
3. On actual `required_actions`, validate the model-emitted payload, render natively, accept user edit, store idempotent intent, submit real `agent.session.input.tool_result` (with exact `turn_id`/`call_id`), then wait for agent-generated revised surface revision+1; verify no duplicate effect and no silent fallback.
4. Kill and relaunch app, re-fetch authoritative snapshot and session items; same user recovers revised surface. Other account receives 403/404 for session, surface and action routes. Network dropped mid-action must reconcile by idempotency key, not resubmit a tool effect blindly.
5. Continue incremental source parity without a key as authorized by the user; retain the live round-trip gate for any claim of real agent behavior or functional parity.

## Machine-readable schema artifacts

The bundled `visual-surface-v1.schema.json` formalizes the currently supported **five** node types, and `visual-surface-v1.fixture.json` records the source-derived interaction snapshot as JSON. Both validate under JSON Schema draft 2020-12. Swift additionally enforces cross-field constraints such as unique node/field IDs, required options for selects, numeric bounds and writable-vs-readonly checklists. This is a v1 prototype subset and must not be advertised as full A2UI. If the model emits this schema through a function tool, the gateway MUST perform the same semantic validation before publishing it.

## User-directed data scope (2026-10-28)

Personal records stay on-device by default. Submitted model context and hosted agent history remain remote processing. The gateway still needs minimal identity/session ownership, integration credential and durable operation state; this does not require mirroring all personal records. Sign in with Apple is a candidate, not implemented or accepted as a complete authentication design. No auth/storage vendor adopted. `gateway/agents-client.mjs` is internal transport only, not a public authorization boundary.

## Native gateway milestone (2026-10-28)

Supersedes the older next-slice status above: local authenticated HTTP gateway and native Debug session connection are implemented. Shared SwiftUI renderer, strict incoming validation, SQLite owner/action journal, native persistence, explicit cancellation recovery and manual provider snapshot refresh are verified against a labelled local provider.28 Node,19 Swift core and12 iOS tests passed with Debug/Release builds. Connected HITL types: choice/form/approval, optional read-only checklist context. Editable page mutation, general native chat/history, full catalog and integration parity remain pending. No live OpenAI session or production login/deployment was exercised. See TEST_EVIDENCE.md and gateway/README.md for exact boundaries.
