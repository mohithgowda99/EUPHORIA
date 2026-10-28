# OpenDuet → EUPHORIA Phase 1 source fidelity ledger

**Explicit product contract (2026-10-28).** Phase 1 is a **faithful OpenDuet iPhone port**, keeping original mobile layouts, screen hierarchy, navigation, task lifecycle, conversations, bots, memory, skills, connections, permissions, galleries, Make, generative UI and failure semantics. Replace CopilotKit Intelligence with OpenAI Agents API via Agent A's authenticated gateway. No ETERNAL style or flow redesign until Phase 2.

This is an *acceptance ledger*, not a feature-completion claim. An invented screen, screenshot-only mock, fixture interaction or generic session record never substitutes for its source OpenDuet task, channel, page or bot. Source references are in `openbot/app/src`; native reference exists under `ios/`. The source tree currently contains **79 TSX route modules**, including layouts and explicit redirects. Route presence alone does not prove an implemented screen.

## P0 source deviation discovered in existing native entry point

`ios/EuphoriaApp/ContentView.swift` currently returns `WorkListView()` as its root. `WorkListView.swift` lists **gateway session envelopes** as rows labeled Tasks, with a new session/legacy workflow. That does **not** equal OpenDuet `ChatScreen` home or the source `TasksScreen` model: original Chat has persistent Bot/channel conversation and original Tasks has real task identities, statuses, assigned questions and reports. The route ledger must keep Chat and Tasks **not source-equivalent** even though a historical gateway test or session list works. Do not silently migrate session records into fake task entities or rebuild Agent A's Tasks backend. Gate native product navigation on actual channel/Task contracts, then port the exact source flows.

**New Agent A progress verified during this review:** At `10617b70d573c812d21d383b7388b9a7bce30eb2`, Agent A published `docs/contracts/tasks-v1.md` and `tasks-v1.schema.json` plus `/v1/tasks` create, list, detail, reply, cancel, resolve/reopen and paginated reports over its existing session journals. It preserves real task identity and source-like derived statuses. **This partially unblocks native Task screen work**, but source-equivalent UI, task-specific push, Up Next suggestions, Bot assignment, rich report synthesis, schedules and live native/provider acceptance remain open. Agent B should bind the original `TasksScreen`/`TaskSheet` behavior to this actual contract rather than showing `GatewayEnvelope` as a Task.

**Immediate Agent A integration dependency:** published authenticated source-equivalent home/channel, task list/detail/question/report and create/stop/continue contracts with durable IDs, ownership, pagination, replay and backend receipts. Agent B then replaces provisional root and wires the existing Tasks browser to actual task data without rewriting gateway services. Until then, `WorkListView` is a **development/session surface**, not a completed product screen.

## The three independently tested UI tracks

| Track | Source authority | Native implementation acceptance |
|---|---|---|
| Controlled product UI | `routes/**`, `components/shell/**`, `components/duet/**`, Bots/Tasks/Memory/Connections/Settings/permissions | Match original mobile screen and navigation, exact state transitions and disabled controls, keyboard/sheet behavior, data linkage, error handling; SwiftUI components backed by real Agent A contracts |
| Standard A2UI | `lib/copilot/a2ui.tsx`, pinned `@copilotkit/a2ui-renderer@1.77.0` and `@a2ui/web_core@0.10.4` | Decode same v0.9 messages; same catalog, item-local bindings, action payloads, stream updates, disabled states and restoration; use mature native protocol engine if it passes tests |
| Open-ended GenUI and published components | `lib/copilot/generative-ui.ts`, `sandboxed-tools.tsx`, `gallery-tools.tsx` | Keep independent WKWebView HTML/CSS/JS sandbox and source gallery/Make flows; require artifact versions, authorization, receipts and recovery, never embed product shell in WebView |

## Evidence columns and completion gate

Every route and feature must collect **six distinct proofs**: (1) direct source reference + iPhone screenshot/behavior trace, (2) native UI and navigation + actual SwiftUI interactions, (3) data model/API parity, (4) failure and permission states, (5) termination/relaunch and conflict recovery, (6) authenticated backend effect/receipt, or an explicit read-only/no-effect finding. Unit tests, simulator video and real provider traces are separate evidence. **Only all six allow “source-equivalent / live verified”.** Empty cells mean NOT DONE. A visual resemblance is insufficient.

### Source-confirmed navigation invariants (not all native verified)

- `/_authed/_app/index.tsx` mounts `ChatScreen` as the home conversation, not an invented dashboard. `chat-screen.tsx` includes first-message creation, ongoing channel reading and reply/error states.
- `/_authed/_app.tsx` mounts `AppShell`; `?page` keeps a bot-produced page over its originating screen. The source shell itself is a single fixed viewport with internally scrolling screens.
- `tasks.tsx` hosts `TasksScreen` and nested `TaskSheet`; task cards in conversation and rows in Tasks open the **same actual task**, deep links included. Dismissal uses opener-aware navigation. `TasksScreen` has Active/Up Next switching, sorting, text search and New Task.
- `tasks.questions.$questionId.tsx` routes to the original `QuestionSheet`; do not replace questions with a generic chat form.
- `make.tsx` hosts `MakeScreen` and nested `PageSheet`; `make.$pageId.tsx` opens the same page over Make. The `page-sheet.tsx` source also handles a bot-produced page over chat, revision actions, slide navigation and task creation.
- `bots.index.tsx` opens `NewBotSheet` through `?new=true`, keeps the roster mounted, and closes the sheet before navigating to the created bot.
- The legacy `/inbox` route redirects to `/tasks`; `/memory` and `/approvals` redirect through the source `LEGACY_PAGES` mapping; `/pages` redirects to `/make`. Do not create replacement top-level products where the reference redirects.

## Exhaustive route module inventory

The native behavior column is an investigation *requirement* unless tied above to inspected source. Avoid promoting a row from “unverified” without a source-linked behavior test.

| OpenDuet source route file | Family | Native status and test requirement |
|---|---|---|
| `__root.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; Auth gate; do not substitute local dev identity |
| `_authed/_app.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; `AppShell`: navigation and overlay search `page`; one viewport |
| `_authed/_app/activity.tsx` | Activity/inbox | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/agents/index.tsx` | Bots and teams | Partial: existing conversation; no source parity; `ChatScreen`: persistent one-Bot conversation, first-message start, stream/error, read state |
| `_authed/_app/approvals.tsx` | Approvals | Source redirect identified; native redirect unverified; Legacy `/approvals` redirects per `LEGACY_PAGES` map |
| `_authed/_app/bot.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.access.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.approvals.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.index.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.memory.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.reach.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.responsibilities.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.routines.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.setup.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.$agentId.sharing.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/bots.index.tsx` | Bots and teams | Source route inventoried; native parity unverified; Bot roster; `?new=true` opens native sheet, Back dismisses, creation returns roster first |
| `_authed/_app/capabilities.index.tsx` | Memory/skills/capabilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/capabilities.memory.tsx` | Memory/skills/capabilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/capabilities.skills.tsx` | Memory/skills/capabilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/capabilities.tsx` | Memory/skills/capabilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/channel/$channelId.tsx` | Channels and collaboration | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/channel/new.tsx` | Channels and collaboration | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/channels.$channelId.tsx` | Channels and collaboration | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/connections.$key.tsx` | Integrations | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/connections.index.tsx` | Integrations | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/group/$channelId.tsx` | Channels and collaboration | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/group/new.tsx` | Channels and collaboration | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/inbox.tsx` | Activity/inbox | Source redirect identified; native redirect unverified; `/inbox` redirects to `/tasks` with replace |
| `_authed/_app/index.tsx` | Shell/chat and remaining | Partial: existing conversation; no source parity; `ChatScreen`: persistent one-Bot conversation, first-message start, stream/error, read state |
| `_authed/_app/make.$pageId.tsx` | Make and pages | Source route inventoried; native parity unverified; `PageSheet` over Make, older page links, close return |
| `_authed/_app/make.tsx` | Make and pages | Source route inventoried; native parity unverified; `MakeScreen` grid/filter/new task and nested page sheet |
| `_authed/_app/memory.tsx` | Memory/skills/capabilities | Source redirect identified; native redirect unverified; Legacy `/memory` redirects per `LEGACY_PAGES` map |
| `_authed/_app/pages.$pageId.tsx` | Make and pages | Source redirect identified; native redirect unverified; Legacy page ID redirect; retain `pageId` |
| `_authed/_app/pages.index.tsx` | Make and pages | Source redirect identified; native redirect unverified; Legacy `/pages` redirects to `/make` with replace |
| `_authed/_app/reachability.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/responsibilities.tsx` | Routines/responsibilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/routines.tsx` | Routines/responsibilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/skills.tsx` | Memory/skills/capabilities | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/start.tsx` | Shell/chat and remaining | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/_app/tasks.$taskId.tsx` | Tasks and questions | Partial: Tasks data; sheet parity open; `TaskSheet` on Tasks or source deep link; dismissal respects opener |
| `_authed/_app/tasks.questions.$questionId.tsx` | Tasks and questions | Source route inventoried; native parity unverified; `QuestionSheet` and source close/fallback behavior |
| `_authed/_app/tasks.tsx` | Tasks and questions | Partial: existing Tasks browser; full UI parity open; `TasksScreen` with its existing list, filters, search, creation; nested task overlay |
| `_authed/_app/team-bots.tsx` | Bots and teams | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/approvals.tsx` | Admin | Source redirect identified; native redirect unverified; Legacy `/approvals` redirects per `LEGACY_PAGES` map |
| `_authed/admin/audit.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/boundaries.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/components/$name.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/components/index.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/computers.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/credentials.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/enterprise.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/identity-providers.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/index.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/learning.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/people.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/playground.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/$key.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/$key_.bots.$agentId.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/$key_.tools.$tool.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/arcade.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/composio.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/plugins/index.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/route.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/admin/skills.tsx` | Admin | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/onboarding.tsx` | Authentication/onboarding | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/approvals.tsx` | Settings | Source redirect identified; native redirect unverified; Legacy `/approvals` redirects per `LEGACY_PAGES` map |
| `_authed/settings/components-gallery/$name.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/components-gallery/index.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/connected-accounts/$key.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/connected-accounts/index.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/index.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/memory.tsx` | Settings | Source redirect identified; native redirect unverified; Legacy `/memory` redirects per `LEGACY_PAGES` map |
| `_authed/settings/notifications.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/passwords.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/route.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/settings/setup.tsx` | Settings | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `_authed/sign-in/$requestId.tsx` | Authentication/onboarding | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
| `sign.tsx` | Authentication/onboarding | Source route inventoried; native parity unverified; Inspect route module and referenced component before defining native behavior |
## Specific fidelity test matrix for first implemented paths

| Source behavior | Correct native acceptance | Failure + restoration evidence | Server effect evidence |
|---|---|---|---|
| Home ongoing conversation | OpenDuet message chronology, send/stream/stop, tool and approval render, first message creates the appropriate conversation | blocked send, network loss, provider unknown, relaunch exact thread/scroll/draft | actual channel and provider turn IDs, durable submit receipts |
| Tasks browser and task sheet | Real task identity and status, list filters/search/sort, deep links, opener-aware sheet close, follow-up question and report | failed/denied/needs-input, in-flight task, relaunch same task ID and pending action | existing Agent A Task detail/status/report and answer receipts, no synthetic session replacement |
| Make and PageSheet | Created page ID, gallery filter, page preview, page-over-chat and page-over-Make, slide/page actions, revision and delete | missing/unauthorized page, stale edit, navigation Back, process kill and reopen same page | authorized page mutation/version/digest and clear success/failure |
| Bots/new bot sheet | Same roster, same setup sequence, `?new` state, Back closes sheet, success navigates to correct Bot | validation error, permission denial, cancel/relaunch | create/update/share/revoke actions with real bot IDs |
| Standard A2UI | Identical source messages and state/events under pinned renderer, including List templates, component updates and multiple surfaces | malformed messages, untrusted URLs/functions rejected, stale revision, unknown effect, relaunch | ownership, capability and event approval through existing gateway journal |
| Open GenUI | Distinct artifact sandbox and source page/gallery controls, not an imitation A2UI card | restricted network/native bridge, artifact revision mismatch, reopen/revoke | trusted artifact publisher and action receipts from Agent A |

**Do not score a feature complete** until every source action has a native route, accurate data, state machine, negative tests and backend result. Tests MUST NOT invoke paid OpenAI services without explicit need. Open work stays visible in the ledger instead of masking it with screenshots.

## Coordination

Agent A owns Tasks and real backend services, including authorizations, graph admission, event journal, lifecycle/persistence contracts. Agent B owns native presentation, A2UI renderer adapter, actual product navigation and UI-level state only. Shared contracts must be reviewed before widening source operations. Never merge Agent A's branch implicitly. Phase 2 ETERNAL styling is expressly out of scope.
