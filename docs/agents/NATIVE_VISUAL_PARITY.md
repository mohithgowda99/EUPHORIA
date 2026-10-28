# EUPHORIA Visual Runtime, parity and gateway contract (design spike)

Status: **source-backed inventory with local native/gateway continuation, gallery and isolated-artifact proof; NOT full feature parity or live Agents API verification.** Reviewed OpenDuet baseline `5b0e15f9719db0628c02a3fe6386dcad683c8302`; starting native foundation `ba91291e75b84c71e18a00edec2db42f079cf4a5`. CopilotKit implementation remains untouched. Canonical route inventory: `docs/ios/FEATURE_PARITY.md` (79 TSX route files, including layouts). This specification extends, rather than silently replaces, that ledger.

## Mapped contracts from source

| Contract family | Exact source reference | Behavioral contract | Native milestone |
|---|---|---|---|
| A2UI primitives | `app/src/lib/copilot/a2ui.tsx` | `Catalog` wraps CopilotKit `basicCatalog`; SDK owns data bindings, actions, component schema; gated by `a2uiProviderOptions` | **unimplemented**: inventory full basicCatalog types, action/data binding model and conformance fixtures before declaring A2UI support |
| HTML Generative UI | `app/src/lib/copilot/generative-ui.ts`, `provider.tsx` | `openGenerativeUI` design skill; sandboxed iframe HTML/JS/CSS; no same-origin session/fetch; theme message channel | **local implementation**: isolated ephemeral WKWebView, unique origin, inline interaction, enforced no-network CSP and denied native/device access. Real WebKit tests pass; arbitrary online/sandboxed-tool parity remains pending |
| Gallery registration | `app/src/lib/copilot/gallery-registry.ts` | Modules export `GALLERY`: `name`, `title`, `kind` chart/card/decision, `description`, `parameters`, `preview`, `Component`, optional `confirmation`/`reads`; sorted stable registry | **partial**: native typed gallery and decisions implemented; no dynamic server-published registry |
| Gallery governance | `gallery-tools.tsx` | Per-active-Bot grant and published description; forbidden components return NOT_SHOWN; revocations override rendering; decisions use `useHumanInTheLoop` and must resolve with denial | **unimplemented**: server-owned component catalog, per-person/Bot grants and denial history |
| Browser-authored sandbox | `sandboxed-tools.tsx` | Published argument JSON schema, runtime `html/css/jsFunctions`, per-call IDs and renderability; fallback/refusals; dedicated sandbox | **unimplemented**: no silent native substitution |
| Read-only gallery cards | `gallery/cards.tsx` | `showRecord`, `showMetrics`, `showChecklist`, `showNotice` return confirmation; `showChecklist` explicitly **cannot be ticked** | **local implementation**: record/metrics/checklist/notice and durable shown receipt; no live-provider trace |
| Graphs | `gallery/charts.tsx` | `showBarChart`, `showPieChart`, `showLineChart`, `showAreaChart`, `showProgress`; typed data, labels and formats | **local implementation**: native Swift Charts and progress; bounded typed input, negative/empty data validation; source display-format options remain incomplete |
| Data table | `gallery/table.tsx` | `showTable` typed columns/rows and display rules | **local implementation**: native sortable table; source column-format options remain incomplete |
| Human decisions | `gallery/decisions.tsx` | `askChoice` returns `{choice:id,label}`; `askApproval` returns `{decision:"approved"|"declined",note?}`; suspend run until `respond`, completed cards are noninteractive | **partial**: native schema validation, queued choice/approval; gateway tool-result continuation verified against local provider only |
| Form HITL | `gallery/form.tsx` | `askForm` <=8 unique field IDs (`^[A-Za-z][A-Za-z0-9_]{0,47}$`), text/email/number/select/textarea, bounds, required, select uniqueness; returns `{status:"submitted",values:{...}}` with numeric values as numbers; `invalid` response for invalid schema | **partial**: typed validation/drafts/pending submission, source-equivalent gateway tool result verified locally |
| Page blocks | `components/duet/page-view.tsx`, `page-rich-block.tsx`, `lib/pages/queries.ts` | text/heading/metrics/bars/image/slide/timeline/decision/checklist/table/comparison, callback `onCheck(persistedIndex,item,checked)`; list tap may send a user turn | **partial**: checklist state only, not full page block schema |
| Task artifacts | `page-card-tool.tsx`, `task-card-tool.tsx`, `offer-task-tool.tsx`, `morning-brief-tool.tsx`, `reply-chips-tool.tsx` | Source-origin cards and interaction routing; task lifecycle and confirmations are server state | **unimplemented** |
| Bot/skill editing | `bot-tools.tsx`, `skill-tools.tsx` | `list_bots`, `read_bot`, `list_bot_skills`, `save_bot` (HITL); `list_skills`, `read_skill`, `list_skill_tools`, `save_skill` (HITL), grant-gated | **unimplemented**; service, policy and schema translation required |
| Computer write approvals | `approval-tools.tsx`, `computer-tools.tsx` | mutating `computer_click/type/key/run_command/write_file` POST `/api/approvals/computer/:botId`; 202 stops current run; only server executes/resumes; client never double-runs effect | **unimplemented**; cloud tool service and durable audit needed |
| Browser/computer read | `computer-tools.tsx` | `computer_navigate/read/snapshot/request_secret/request_help/list_files/read_file/scroll`, with specific permission and origin rules | **unimplemented**; no personal computer needed for some hosted operations but not behaviorally equivalent |
| Conversation & history | `conversation.tsx`, `bot-thread.ts`, `thread-messages.ts`, `repair-history.ts` | transcript tools submit a user turn, storage per Bot, durable thread and replay of rich tool state | **partial**: same-session inputs, cancellation, owned session list, item pagination and locally archived surfaces; no streaming/full AG-UI rich replay |
| Data, permissions, routines | `server/src/app.ts` and `routes/*`, `server/src/approvals/*`, `server/src/memory/*` | auth, session ownership, memory provenance, integrations, channels, groups, routines, audit and admin | **unimplemented** serverless product services |

Gallery names are a source snapshot, **not the entire CopilotKit A2UI basic catalog**. Generated tool/page/computer state not enumerated above remains a required source-by-source parity task; do not mark any row green until tests reproduce each meaningful interaction.

## Versioned native protocol and persistence

`VisualSurface {schemaVersion,surfaceID,revision,nodes}` uses stable IDs and a strict kind discriminant. Version 1 supports askChoice, askForm, askApproval, showChecklist and pageChecklist. Version 2 additionally supports typed gallery and isolated htmlArtifact. The compatibility schema remains named `visual-surface-v1.schema.json`; new kinds require version 2. This is an EUPHORIA adapter, not native CopilotKit or Agents API output. Full A2UI layout/bindings remain unimplemented.

`VisualAction {id,surfaceID,expectedRevision,nodeID,kind,values}` separates local drafts from queued external intentions. `setField` persists form/approval drafts locally. Notes use existing node/revision-scoped values. `choose`, `decide`, `submitForm` translate to source-equivalent tool results. `displayed` returns `{status:"shown"}` for read-only surfaces; it is an acknowledgement, not a user approval. `pageChecklist` is still a local interaction analogue, not connected page mutation.

The gateway validates identity, ownership, revision, current required action, call/turn IDs, schema and idempotency before submission. Journal first, send second. Accepted native decisions lock; definitive rejection is terminal; uncertain effects survive restart and are never replayed automatically. A UI approval is not evidence an external effect executed.

Native SwiftData keeps visual drafts and account-scoped conversation projections in one container. The gateway's SQLite holds minimal ownership, surface versions and operation receipts. Personal records stay on device by default; submitted context and provider history are remote processing. Production auth, retention/deletion, encryption/deployment and multi-process coordination are not qualified.

## Local gateway routes

- `POST /v1/sessions`, `GET /v1/requests/:id`, `DELETE /v1/requests/:id`: journalled creation and unreceived-request cancellation.
- `GET /v1/sessions`, `GET /v1/sessions/:id`: owned roster and authoritative provider snapshot; manual refresh.
- `POST /v1/sessions/:id/messages`, `POST /v1/sessions/:id/cancel`: durable idempotent input intentions.
- `GET /v1/sessions/:id/inputs`, `POST /v1/sessions/:id/inputs/reconcile`: status and safe unreceived-input cancellation.
- `GET /v1/sessions/:id/items?after&limit`: newest-first provider pagination, chronological native page order. Known messages and tool/surface metadata are normalized. Unsupported content is marked; raw unknown tool arguments/results are not forwarded.
- `POST /v1/surfaces/:id/actions`, `POST /v1/surfaces/:id/reconcile`: source-equivalent tool response and acknowledgement recovery.

SSE, webhooks/APNs and automation endpoints are **not implemented**. Provider stream disconnection must be recovered through saved items and authoritative session state; do not promise event replay.

## Generated artifact boundary

User approved isolated web artifacts with a native shell on 2026-10-28. Each artifact gets an ephemeral store and unique custom-scheme origin. Inline HTML/CSS/JavaScript can run; external networking, nested frames/workers, form submissions, external navigation, popup windows, file pickers, media/location/motion permissions and native message handlers are denied. WebRTC/WebTransport constructors are removed before content. Artifact DOM state is ephemeral; the canonical HTML is persisted and reconstructs on reopen. This is not arbitrary online tool execution or a native code generator.

## Verification and remaining gate

See `TEST_EVIDENCE.md` for executed counts, failed attempts and limits. Native builds and tests are local evidence. No live OpenAI session, external integration, hosted computer action, production identity or full source parity has been demonstrated. Lack of a key does not prevent continuing the missing native/service implementation.

Official contracts checked 2026-10-28:
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/docs/guides/agents-api/sessions/events
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list
