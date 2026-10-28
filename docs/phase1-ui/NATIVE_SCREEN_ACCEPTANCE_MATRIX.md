# EUPHORIA / Agent B: full OpenDuet product UI acceptance register

Canonical reference: `docs/ios/FEATURE_PARITY.md`, 79 `.tsx` route modules under `openbot/app/src/routes` including layout/index routes. This is an acceptance map, **not** a completed native port. The native code must reuse existing gateway-backed Tasks/Conversation/SwiftData models and wait for stable API contracts for missing services. Statuses: *existing partial*, *fixture only*, *not implemented*, *live verified*. A generic mock screen is not parity.

| Source routes / components | Required native flows and interaction states | Current evidence; gaps | Agent A contracts |
|---|---|---|---|
| Home `/index`, sidebar, activity, inbox | Native navigation, global selection, unread/busy, refresh, empty/loading/denied/failed, deep links | Existing partial shell and WorkList; full state/navigation unverified | list/work summary, typed activity/unread streams |
| Bot direct conversation, channel transcript | Send, stream, queued turns, tool/HITL display, stop, historical items and live recovery | Existing partial GatewaySession and conversation history, one prior live choice. Full parity open | canonical session events, tool/result IDs and pagination |
| Tasks `/tasks`, `/tasks.$taskId`, questions, reports | Browse/resume, question responses, status/failed/denied/interrupted/report | Existing Tasks browser/pagination agent-owned, do not recreate storage | Tasks list/detail/status/questions/receipt schemas |
| Bots `/bots`, `bots.$agentId.*`, team Bots | Create/edit/profile, role grants, skills, reach, handoff, sharing and revocation | Not implemented as native complete workflow | bot schema, owner/team permissions, publish/change receipts |
| Memory `/memory`, profile memory, settings | Provenance, confirm/edit/remove, review states, source attribution | Not implemented as native complete workflow | memory CRUD, version and provenance, conflict rules |
| Skills `/skills`, bot skill editor | Browse/search/edit/create, grants, test/use, refusal, history | Not implemented | skill catalog + editor schema and authorization |
| Connections `/connections.*`, `/settings/connected-accounts.*` | OAuth grant/revoke, scoped capabilities, expired/reconnect, SSO/provider refusal | Not implemented | connection inventory/grants/redirect/refresh without app secrets |
| Routines `/routines`, responsibilities `/responsibilities` | Schedule edit/pause, timezones, recurrence, status/history, triggers, denied/failed | Not implemented | automations, schedules, timezone policies, receipts |
| Channels/group routes, collaboration | Roster, join/leave, mention routing, 1:N Bots, attachments, unread, role boundaries | Not implemented | channels, membership, delivery, events and pagination |
| Approvals, settings, audit, team/admin | Inline decision, allow-once/deny, policy, role change, audit trails, revocation | Partial native decision fixture; **not** actual authorization | durable pending decisions, idempotency, audit, effect receipts |
| Make `/make`, generated pages `/pages`, editor | Structured text/metrics/tables/checklist/timeline/slides, edit/history, generated artifact lifecycle | Gallery and limited compositional fixtures; rich page editor unimplemented | artifact version/store/restore, write permissions and conflicts |
| Gallery, A2UI, dynamic published components | 18 source catalog components + custom tools, bindings, streaming, grants, refusals | 8 existing + 10 added **partially**; dynamic templates/scoped state unimplemented | normalized graph streams, grants, schema publish, receipts |
| Tool history/progress, computer/browser/take control | Progress stream, screenshots, transfer control, commands/files, secret masking, approvals | Not implemented; no fake computer controls | actual sandbox sessions, status, screenshots, controls, permission checks |
| Voice/dictation/attachments | Record/transcribe/interruption/upload, sending, permission, error and offline | Not implemented | audio, file upload, transcription, approvals/storage |
| Notifications/account/onboarding/settings | Native permission, APNs, device enrollment, sign-in/revocation, preferences | Existing dev gateway identity only; production unverified | production auth, device registrations, push and user settings |
| Enterprise admin `/admin/*` | People, roles, IdPs, boundaries, credentials, package config, audit exports | Not implemented | admin-only endpoints, policy, audit, redacted secrets |

## Shared acceptance criteria for every family

1. Source-backed screen route, component and actual user action mapping, not a static visual approximation.
2. Deep link and navigation to/from active work without losing draft or selected workspace.
3. Empty, loading, active, completed, denied, interrupted, failed, unavailable and retry-uncertain states where relevant.
4. Permission-gated controls, no client-completed side effects, durable idempotent receipts from Agent A.
5. SwiftData restoration and conflict handling after terminate/relaunch, offline-to-online reconcile, and cross-user isolation.
6. XCTest, interactive simulator pass, and one real authenticated end-to-end trace before any family is marked *live verified*.

**Do not duplicate Agent A's Tasks browser, recovery, pagination or gateway execution implementation.** Requests to Agent A remain in a separate handoff document; no gateway files changed here.
