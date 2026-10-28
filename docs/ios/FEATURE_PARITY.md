# EUPHORIA native feature parity ledger

**Reference:** OpenDuet fork at `5b0e15f9719db0628c02a3fe6386dcad683c8302`. **Current phase one:** incomplete. Local validated decisions/forms, continuation/history/cancel, typed gallery and isolated generated artifacts are implemented; full source parity is not verified. A route's existence is source inventory, not evidence of tested behavior.

## Canonical React route and screen file inventory

The following is **all 79** `.tsx` route files under `openbot/app/src/routes/` from the recursive baseline Git tree (includes layout/index/dynamic routes, not 79 distinct visible screens). App dialogs, tool cards and overlays are separately inventoried below.

- `__root.tsx`
- `_authed.tsx`
- `_authed/_app.tsx`
- `_authed/_app/activity.tsx`
- `_authed/_app/agents/index.tsx`
- `_authed/_app/approvals.tsx`
- `_authed/_app/bot.tsx`
- `_authed/_app/bots.$agentId.access.tsx`
- `_authed/_app/bots.$agentId.approvals.tsx`
- `_authed/_app/bots.$agentId.index.tsx`
- `_authed/_app/bots.$agentId.memory.tsx`
- `_authed/_app/bots.$agentId.reach.tsx`
- `_authed/_app/bots.$agentId.responsibilities.tsx`
- `_authed/_app/bots.$agentId.routines.tsx`
- `_authed/_app/bots.$agentId.setup.tsx`
- `_authed/_app/bots.$agentId.sharing.tsx`
- `_authed/_app/bots.index.tsx`
- `_authed/_app/capabilities.index.tsx`
- `_authed/_app/capabilities.memory.tsx`
- `_authed/_app/capabilities.skills.tsx`
- `_authed/_app/capabilities.tsx`
- `_authed/_app/channel/$channelId.tsx`
- `_authed/_app/channel/new.tsx`
- `_authed/_app/channels.$channelId.tsx`
- `_authed/_app/connections.$key.tsx`
- `_authed/_app/connections.index.tsx`
- `_authed/_app/group/$channelId.tsx`
- `_authed/_app/group/new.tsx`
- `_authed/_app/inbox.tsx`
- `_authed/_app/index.tsx`
- `_authed/_app/make.$pageId.tsx`
- `_authed/_app/make.tsx`
- `_authed/_app/memory.tsx`
- `_authed/_app/pages.$pageId.tsx`
- `_authed/_app/pages.index.tsx`
- `_authed/_app/reachability.tsx`
- `_authed/_app/responsibilities.tsx`
- `_authed/_app/routines.tsx`
- `_authed/_app/skills.tsx`
- `_authed/_app/start.tsx`
- `_authed/_app/tasks.$taskId.tsx`
- `_authed/_app/tasks.questions.$questionId.tsx`
- `_authed/_app/tasks.tsx`
- `_authed/_app/team-bots.tsx`
- `_authed/admin/approvals.tsx`
- `_authed/admin/audit.tsx`
- `_authed/admin/boundaries.tsx`
- `_authed/admin/components/$name.tsx`
- `_authed/admin/components/index.tsx`
- `_authed/admin/computers.tsx`
- `_authed/admin/credentials.tsx`
- `_authed/admin/enterprise.tsx`
- `_authed/admin/identity-providers.tsx`
- `_authed/admin/index.tsx`
- `_authed/admin/learning.tsx`
- `_authed/admin/people.tsx`
- `_authed/admin/playground.tsx`
- `_authed/admin/plugins/$key.tsx`
- `_authed/admin/plugins/$key_.bots.$agentId.tsx`
- `_authed/admin/plugins/$key_.tools.$tool.tsx`
- `_authed/admin/plugins/arcade.tsx`
- `_authed/admin/plugins/composio.tsx`
- `_authed/admin/plugins/index.tsx`
- `_authed/admin/route.tsx`
- `_authed/admin/skills.tsx`
- `_authed/onboarding.tsx`
- `_authed/settings/approvals.tsx`
- `_authed/settings/components-gallery/$name.tsx`
- `_authed/settings/components-gallery/index.tsx`
- `_authed/settings/connected-accounts/$key.tsx`
- `_authed/settings/connected-accounts/index.tsx`
- `_authed/settings/index.tsx`
- `_authed/settings/memory.tsx`
- `_authed/settings/notifications.tsx`
- `_authed/settings/passwords.tsx`
- `_authed/settings/route.tsx`
- `_authed/settings/setup.tsx`
- `_authed/sign-in/$requestId.tsx`
- `sign.tsx`

## Pre-existing Expo mobile route files (11; comparison only)

- `_layout.tsx`
- `approvals.tsx`
- `bot.tsx`
- `bots.tsx`
- `computer.tsx`
- `conversation.tsx`
- `index.tsx`
- `memory.tsx`
- `plugins.tsx`
- `routine.tsx`
- `rules.tsx`

Existing Expo mobile is React Native, not SwiftUI. Its conversation sends to `/api/delivery/conversations/:id/messages` and refreshes history, so it is **not** evidence of AG-UI streaming/tool-call parity.

## Cross-cutting UI parity checklist

Every row requires native functional tests, failure-path tests and comparison with the source behavior. The evidence below validates specific local subsets; no row represents complete source parity.

| Capability / UI family | Source of truth | Native acceptance evidence required |
|---|---|---|
| Session, sign-in, SSO, account changes, onboarding | `app/src/routes/sign.tsx`, auth routes, onboarding, `server/src/auth/index.ts` | Provider redirect returns authenticated app; reconnect/logout/revocation, 401/403/SSO enforcement |
| Main shell, tabs/navigation, roster, inbox | `_authed/_app/*`, `components/app-sidebar/*`, `routes/*inbox*` | Route reachability, pagination, selection, unread/pinned/busy, resync/reconnect |
| Bot roster, profiles, access/sharing, management | `components/agents/*`, `components/bot-profile/*`, `/api/agents` | User/admin policy parity; bot creation and handoff |
| Channel chat, groups, mentions, attachments | `components/channels/*`, `composer/*`, `/api/channels` | Streaming, abort, queue order, retry, grouped turns, multi-Bot, media |
| Proactive Tasks, suggestions, questions, notifications | `routes/*tasks*`, `components/approvals/*`, `/api/openduet/tasks`, proactive routes | New suggestions, start/hide, questions, transitions, errors, deep links |
| Routines, schedules, responsibilities, reachability | `routes/*routines*`, `routes/*responsibilities*`, server routes | Create/edit/pause/run state, time zones, recurrence, execution statuses |
| Approvals, personal/team rules, audit | `components/approvals/*`, `server/src/approvals/*` | Server-issued gating, 202 halt/resume, reject/allow, replay prevention, audit |
| Computer visual stream + take control | `components/computer/*`, `server/src/computer/routes.ts` | Screenshots/live, status, takeover/release, input, sign-in/secret masking, file/command controls |
| Memory | `routes/*memory*`, `server/src/memory/*` | Read/edit/delete/confirm, provenance, restart durability |
| Connections, plugins, tools, skills | `routes/*connections*`, `routes/*skills*`, `components/plugins/*`, `/api/plugins` | Permissions, grant/revoke, integration workflows, errors |
| Generated UI, A2UI, page-maker, gallery | `app/src/lib/copilot/a2ui.tsx`, `gallery-tools.tsx`, `sandboxed-tools.tsx`, pages routes | Native schema rendering, event replay; explicitly isolated HTML exception only |
| Voice, dictation, transcription, attachments | `components/channels/composer/*`, voice/dictation routes | Capability-gated recording, streaming, mute/interrupt, upload failures |
| Admin: people, IdP, boundaries, audit, policies, credentials | `routes/_authed/admin/*` | Admin-only routing, no privileged UI outside role; exports/secrets remain secure |
| Setup and deployment diagnostics | `routes/*start*`, `routes/*setup*`, `/api/capabilities` | Runtime/config gating, clear recoverable errors, no secret leakage |
| Realtime and recovery | `lib/channels/use-channel-events.ts`, `lib/copilot/join-thread.ts`, composer queue | Socket resync, reconnect, duplicate events, stop/resume, idempotent sends |
| History and persistence | `lib/copilot/bot-thread.ts`, `thread-messages.ts` | Persisted thread id, full restored AG-UI content, known/unavailable distinction |

## React frontend tool catalog, audit checklist

Source modules: `approval-tools.tsx`, `bot-tools.tsx`, `computer-tools.tsx`, `escalation-tool.tsx`, `gallery-tools.tsx`, `handoff-tool.tsx`, `morning-brief-tool.tsx`, `offer-task-tool.tsx`, `page-card-tool.tsx`, `reply-chips-tool.tsx`, `sandboxed-tools.tsx`, `sign-in-tool.tsx`, `skill-tools.tsx`, `task-card-tool.tsx`.

- **Computer tools:** `computer_navigate`, `computer_read`, `computer_snapshot`, `computer_type`, `computer_click`, `computer_key`, `computer_request_secret`, `report_refusal`, `computer_request_help`, `computer_list_files`, `computer_read_file`, `computer_run_command`, `computer_write_file`, `computer_scroll`. The mutating subset is specifically gated by `approval-tools.tsx`.
- **Bot lifecycle and skills:** `list_bots`, `read_bot`, `list_bot_skills`, `save_bot` (HITL); `list_skills`, `read_skill`, `list_skill_tools`, `save_skill` (HITL). Conditional on Bot grants/skills.
- **Human interactions/rendering:** `ask_person`, `computer_request_sign_in`, `message_bot` render, morning brief, `suggest_replies`, `make_page`, task offer/start card renderers. Some **render existing server tools only**, not executable native functions.
- **Dynamic registries:** gallery components and sandboxed tools register names and JSON/Zod schemas from the server; A2UI and open-generative-ui are capability gated. **A fixed names-only list cannot establish parity.**

For every tool record: exact name; offered conditions; parameter schema; read vs mutation; executor (server/client/render-only); run/agent/bot context; approval control; result serialization; stop/cancel/resume; history rehydration; errors; regression fixture. **Never implement a no-op handler to make a tool appear registered.**

## Current acceptance evidence — 2026-10-28

| Capability | Current evidence | Remaining gap |
|---|---|---|
| Debug/Release native builds | Passed; 18 iOS XCTest passed, no failures/skips | Signing/physical-device qualification |
| Approval-note draft recovery | Core and on-disk SwiftData reopen passed; node/revision scoped and locked after submission | Full live external approval workflow |
| Native choice/form/approval result | Gateway fixture tests and prior native three-step trace; current request/choice trace accepted | Real provider and external executor |
| Conversation follow-up/cancel/history | 63 gateway /49 core /20 native suite totals; owned endpoints, intent journal, newest-window pagination, bounded live snapshots/reconnect and persisted re-entry | Live API, token-delta text, attachments/grouped/rich AG-UI parity; complete new manual flow remains incomplete |
| A2UI source form | Source text/boolean/single/multiple controls → native edit/reopen/locking → typed source event through the existing journal;52 gateway/45 core/18 iOS totals | Nested/shared bindings and remaining basic catalog, dynamic layouts/functions/bindings/grants; full source parity |
| Gallery/HTML | Nine native gallery types and isolated HTML; shared 10-node fixture validates in Swift and gateway; real WebKit tests execute inline interaction and block fetch | Dynamic grants/registries, A2UI bindings, source formatting options, full online sandboxed tools |
| Production auth/deployment | Development-token owner isolation tests | Real identity verifier, login/revoke, hosted deployment, distributed state |
| Computer/integrations/routines/admin and all other routes | Source inventory only | Native/service implementation and end-to-end traces |

Counts are totals, not per-feature coverage. Exact commands, failed attempts and retained local evidence: `../agents/TEST_EVIDENCE.md`.

## Recommended phase-one closure order

The current native interaction foundation is tested. The following are product milestones, not completed features or a percentage estimate. Existing source routes/tools remain the full reference; changing that scope requires an explicit user decision.

1. [ ] **Live agent vertical journey:** actual provider session, native streaming, supported interactive UI, real tool-result continuation, cancellation/interruption and authoritative restoration. The adapter code exists; live behavior remains unverified.
2. [ ] **Generated interface coverage:** nested/shared model bindings, remaining catalog/layout/actions, rich persisted pages, dynamic component/tool grants and full sandboxed-tool behavior. Current form/gallery/artifact support is partial.
3. [ ] **Usable native product workflows:** actual app navigation, inbox/channels/groups, bots/skills/memory, tasks/questions, routines/responsibilities/reachability, attachments/voice/notifications and team/admin/policy flows. Debug fixture menus are development proof, not these workflows.
4. [ ] **Real execution and integrations:** OAuth/grants/credentials and tool adapters; hosted computer/browser/files/commands, takeover/secret entry and durable server-owned approvals/audit. Rendering an approval is not executor implementation.
5. [ ] **Account and deployed service readiness:** production login/token verification/revocation, ownership/access controls, secure hosted gateway, durable background schedules/task state, privacy/retention/deletion and deployment/device configuration. Personal data remains device-first; minimal ownership/operation/credential services are still required.
6. [ ] **Acceptance against the full source inventory:** native traces for supported routes/tools including failure, denied/revoked access, network interruption, duplicate delivery, cancel/reopen and physical-device use; actual provider and server effects. Test totals and compilation cannot close these gates alone.

Custom ETERNAL visual treatment is phase two. Phase one still needs coherent native product screens and working source behavior. Provider credentials unlock live verification; most missing implementation can proceed independently.

## Definition of "complete"

No silent omissions; every route, modal, tool registration, background process, permission and error branch has an entry and a real native trace. Tests must show equivalent server effects, not pixel-identical browser output. All unverified items stay unverified after a compile-only milestone.
