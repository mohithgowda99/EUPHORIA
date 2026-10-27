# EUPHORIA: Native Visual Runtime and Agents API spike

**Status:** isolated source audit and portable Swift proof. **Not** an OpenDuet parity claim or live Agents API integration. Started from the validated SwiftUI foundation at `ba91291e75b84c71e18a00edec2db42f079cf4a5`. No changes to `main`, `feature/ios-native-m0-m1`, `openbot/`, or CopilotKit.

The full testable code, native SwiftUI renderer, SwiftData persistence model, and detailed capability matrix were produced as a separate downloadable engineering bundle, with an installer that **refuses** to run except on this new branch. This branch contains the architecture handoff only until the native artifacts are applied and independently built on macOS.

## Source-driven parity families, not a generic card

The canonical screen inventory remains `docs/ios/FEATURE_PARITY.md` (79 TSX route source files, including layouts). The renderer port must preserve every functional state and permission rule, not just layouts.

| Behavior | Existing implementation | Native requirement |
|---|---|---|
| A2UI | `openbot/app/src/lib/copilot/a2ui.tsx`, CopilotKit `basicCatalog` and SDK data binding/action semantics | Native catalog, typed tree, bindings, actions and versioned replay. Not yet implemented. |
| Generative HTML/CSS/JS | `generative-ui.ts`, `provider.tsx` | Independent sandbox with no shared API credentials; never the basis of the entire app. |
| Gallery discovery and governance | `gallery-registry.ts`, `gallery-tools.tsx` | Per-Bot grants, published model descriptions, refusal/NOT_SHOWN history, rendering-only vs suspended decision. |
| Sandboxed components | `sandboxed-tools.tsx` | Published JSON Schema, versioning, per-call source and grant checks; separate rendering confinement. |
| Decision controls | `components/gallery/decisions.tsx` | `askChoice` returns `{choice,label}`, `askApproval` returns `{decision,note?}`; pending vs completed distinct; real agent wait/resume. |
| Form | `components/gallery/form.tsx` | `askForm` 1–8 fields, unique IDs, email/number/select bounds, `{status:"submitted",values}`; invalid requests release the waiting agent. |
| Read-only and editable checklists | `gallery/cards.tsx`; `components/duet/page-view.tsx` and `page-rich-block.tsx` | `showChecklist` is read-only; a page-block checklist uses explicit persisted edits and callbacks. |
| Charts/tables/cards | `gallery/charts.tsx`, `table.tsx`, `cards.tsx` | Typed schemas for every component, not generic substitutions. |
| Tools and approvals | `bot-tools.tsx`, `skill-tools.tsx`, `approval-tools.tsx`, `computer-tools.tsx` | Grant-gated execution and HITL; mutating computer 202 interrupts existing run and server owns side effect. |
| Artifacts, channels, automations | `page-card-tool.tsx`, `task-card-tool.tsx`, `reply-chips-tool.tsx`, backend routes | Product services for artifacts, roles, connections, schedules, sharing, memory, audit. |

## Versioned EUPHORIA contract, first subset

`VisualSurface {schemaVersion:1,surfaceID,revision,nodes:[{id,kind,title,summary?,options?,fields?,items?}]}` where `kind` currently permits only `askChoice`, `askForm`, `askApproval`, `showChecklist`, `pageChecklist`. No scripts, markup, arbitrary Swift symbols, or raw credentials are executable. Unknown component kinds and unsupported versions fail closed.

`VisualAction {id,surfaceID,expectedRevision,nodeID,kind,values}` is an idempotent user **intent**. Draft form fields persist locally; submission, selection, approval and page checkbox actions enter a durable pending queue. Local mutation never claims remote success or advances the authoritative revision. The gateway must acknowledge event IDs after checking identity, tool grants, server-side revision and current OpenAI `required_actions`.

The complete contract and acceptance sequence are in the separate spike's `docs/agents/NATIVE_VISUAL_PARITY.md`, which extends (does not replace) the existing parity ledger.

## Proposed cloud gateway, not implemented

- Authenticated per-user `POST /v1/sessions` maps a user to OpenAI `POST /v1/agents/sessions` and stores cloud ownership.
- Authenticated `GET /v1/sessions/{id}/events` streams real Agents API events; `GET /v1/sessions/{id}` reconciles authoritative items after disconnect.
- `GET /v1/surfaces/{id}` returns versioned, authorized visual snapshots.
- `POST /v1/surfaces/{id}/actions` requires `id` idempotency and expected revision; retrieves pending `function_call` including `turn_id` and `call_id`, submits the real `agent.session.input.tool_result`, and awaits an actual revised surface.
- Approvals, service OAuth and tool effects are executed server-side with audit and replay protection.
- Verified session webhooks trigger cloud state fetch and APNs; SwiftData is a local view/cache, not unattended execution state.

OpenAI reference:
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/docs/guides/agents-api/sessions/events
- https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks
- https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/automations/methods/create

## Evidence and gating

**Executed independently on Linux Swift 6.2.1:** `swift test --jobs 2` in the portable `VisualRuntimeCore` package: **8 tests passed, zero failures**. These test validation, typed choice and form responses, pending approvals, read-only vs editable checklists, deduplication, Codable state restoration and authoritative revision acknowledgement.

**Not executed here:** Xcode/iOS 27 build, SwiftUI interaction, SwiftData in-app restoration, OpenAI Agents API request, function-tool continuation, real agent-generated revision, scheduled task, gateway webhooks or cross-user access tests. The prior branch's 6/0 simulator report does not apply automatically to this new branch.

**Next executable milestone:** apply the spike to this branch on a Mac, run both simulator builds and the expanded XCTest suite, prove local draft/action restoration, then deploy the smallest authenticated gateway and run a real `render_surface` function call -> native edit -> `tool_result` -> revised native surface -> kill/reopen -> cloud reconciliation. No full-screen port or parity declaration before this live proof.
