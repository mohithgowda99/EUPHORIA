# EUPHORIA: M0 architecture and native integration design

**Status:** M0 source audit, not a tested mobile implementation. **Immutable baseline:** `5b0e15f9719db0628c02a3fe6386dcad683c8302` (2026-10-27). **Scope:** React frontend replacement only. **Rule:** No backend changes for M0/M1.

## Repository topology and trust boundaries

- `openbot/app/`: authoritative full React UI, TanStack Router, CopilotKit React v2, TanStack Query. Preserve it unchanged as the functional reference.
- `openbot/mobile/`: *partial* Expo/React Native mobile client. Its REST delivery model is not full CopilotKit parity. Reuse documented endpoint shapes, not UI or Expo runtime.
- `openbot/server/`: Hono HTTP service, Better Auth, access/roles, CopilotKit v2 runtime, routing, approval gates, audit, memory, proactive tasks, channel and computer APIs. **Do not fork logic into Swift.**
- `openbot/agent-*/`, `openbot/worker/`, `openbot/supervisor/`, `openbot/toolkit/`, `openbot/shared/`: existing agent frameworks, routine execution, computer environment, middleware and shared contracts. Server/worker contracts stay authoritative.
- `openbot/desktop/`: existing Tauri desktop application with a separate desktop OAuth transfer; **not** a ready-to-reuse iOS UI.
- `openbot/examples/openduet/`: OpenDuet-specific configuration, prompts and skills.
- **External dependency:** CopilotKit Intelligence is required by the upstream README for durable threads and memory. It is not replaced, simulated or bundled.

Architecture:

```text
Native SwiftUI presentation
  -> @MainActor application state / typed view models
    -> endpoint clients (URLSession, URLSessionWebSocketTask where verified)
    -> AG-UI client adapter (SDK chosen only after compatibility spike)
      -> EXISTING HTTPS OpenBot server /api/copilotkit
      -> EXISTING HTTP APIs under /api
          -> CopilotRuntime, Better Auth, server approval/permission checks
          -> existing agent backends, worker, computer, DB and Intelligence
```

**Auth, permissions, execution, approval state and durable history are server-owned.** The iOS app stores no model secrets, CopilotKit Intelligence keys, server credentials or bypass policy. Use Keychain only after the existing Better Auth native handoff has been verified.

## Exact contracts located in baseline

| Boundary | Existing contract and evidence | Native requirement |
|---|---|---|
| Basic health | `GET /health`, `GET /api/capabilities` in `server/src/app.ts`; capabilities public, intentionally projects non-secret fields only | HTTPS probe, capability gating; do not interpret reachability as authentication |
| Session | `server/src/auth/index.ts`, `auth/guards.ts`; Better Auth session checked with request headers, roles enforced as 401/403 | Prove safe iOS session creation, restoration, logout and request header propagation against actual server |
| Native auth caveat | `server/src/auth/index.ts` loads Better Auth Expo plugin and trusts `openbotmobile://` **only when `EXPO_PROJECT_ID` is set** | Do not assume `ASWebAuthenticationSession` alone completes session transfer; spike current Better Auth mobile callback/token behavior first. No backend modifications without review |
| AG-UI | Browser `CopilotKitProvider(runtimeUrl="/api/copilotkit", credentials="include")` in `app/src/lib/copilot/provider.tsx`; server runtime mounted at root with internal basePath in `server/src/copilot.ts`, `app.ts` | Discover `/api/copilotkit/info`, its run route and metadata in a real deployment; reproduce CopilotKit v2 semantics, not merely raw /run against an arbitrary agent |
| Direct Bot chat thread | `app/src/lib/copilot/bot-thread.ts`, `thread-messages.ts`; `POST /api/threads/mint`, `GET /api/threads/:threadId`, history schema normalization | Persist per-user/per-bot thread identity and recover stored tool-call dialect without silent loss |
| Channel/conversation | `/api/channels`, `/api/delivery/conversations`, `/history?agentId=`, `POST .../messages` (202) in server delivery routes | Separate asynchronous delivery from interactive AG-UI runs; preserve idempotent externalId, status and author attribution |
| Live roster | `/api/channels/events` WebSocket and resync logic in `app/src/lib/channels/use-channel-events.ts` | Invalidate/refetch authoritative roster on reconnect, resync and unknown-channel events |
| Computer | `/api/computers/:botId/{status,screenshot,read,navigate,click,type,key,scroll,control,...}` and file/command routes in `server/src/computer/routes.ts` | No direct browser/computer tokens in client; ownership and policy enforced on server |
| Durable approvals | `POST /api/approvals/computer/:botId`, `POST /api/approvals/:id/decision`, `POST /api/approvals/questions/:id/respond`; `app/src/lib/copilot/approval-tools.tsx` | On 202 stop client run; server executes and resumes. Do not locally replay effect or fabricate tool success |
| Memory | `/api/memory`; threads/learned memory backed by CopilotKit Intelligence | Match record editing/review, permission, server history and cross-launch restoration |
| Other routed APIs | `/api/agents`, `/api/routines`, `/api/plugins`, `/api/components`, `/api/openduet/*`, `/api/responsibilities`, `/api/proactive`, `/api/identity`, `/api/admin/*` | Implement against source-defined schemas; preserve role gating, pagination and errors |

## Frontend tool execution is a first-class protocol

The React root registers computer tools, sign-in, bot creation, skill creation, gallery/sandboxed components, special OpenDuet cards and rendering-only tools, via `useFrontendTool`, `useHumanInTheLoop`, or render-tool registrations. **Tools are not all the same:** some execute REST actions, some show decisions, some only render a server-executed tool result. The catalog depends on active Bot, capability flags, grants and skill permissions. A global unconditional native tool registry would change agent behavior and violate parity.

**Computer mutating tools** (`computer_click`, `computer_type`, `computer_key`, `computer_run_command`, `computer_write_file`) call the server approval gate first. A 202 response means the server owns the decision and continuation. Never issue a second computer mutation in the client after approval. Consult `app/src/lib/copilot/approval-tools.tsx` and `server/src/approvals/routes.ts` on every change.

For AG-UI, preserve RUN_STARTED/FINISHED/ERROR, message snapshots and deltas, tool call argument assembly, tool result correlation, state snapshots/JSON Patch deltas, interruptions, cancellations, session-aware streaming, ordering, duplicated frames and replay. Custom/RAW/activity/A2UI and open-generative-ui events cannot be silently ignored when they carry an OpenDuet capability. **Read and preserve unknown payloads rather than discarding them.**

**M1-A clarification (2026-10-27):** The runtime here is **Intelligence-backed**. Per the CopilotKit v2 runtime HTTP contract, the multi-route `POST /api/copilotkit/agent/:agentId/run` may return JSON containing `threadId`, `runId`, `joinToken`, and `realtime: {clientUrl, topic}`. The client then joins the Intelligence WebSocket and receives AG-UI events on that channel; `POST .../connect` is also an admission route. Therefore an HTTP/SSE-only Swift `HttpAgent` is **insufficient for the production path**, even if its AG-UI event decoder is reusable. Implementing simple `URLSession.bytes` SSE from `/run` is **not** M1 proof. The v2 REST runtime also exposes `GET .../info`, `POST .../stop/:threadId`, `GET .../threads/:threadId/messages` and `GET .../threads/:threadId/events`. Probe the exact deployed version before coding against documentation. Source: https://docs.copilotkit.ai/ms-agent-python/backend/runtime-endpoints (Runtime HTTP endpoints, Intelligence section).

## Swift AG-UI SDK decision record (not yet approved)

Checked community source repositories on 2026-10-27:
1. [mattsp1290/ag-ui-swift](https://github.com/mattsp1290/ag-ui-swift): SwiftPM `AGUICore` + `AGUIClient`, iOS 16+, MIT; derived from upstream AG-UI Swift PR #1512 (commit `84c7fbfc51d5c0295ffc0561636f11b7ff70a422`), supports bounded SSE watch, status/content-type, cancellation, raw events. **Preferred compatibility-spike candidate**, NOT yet integrated.
2. [paduh/ag-ui-swift](https://github.com/paduh/ag-ui-swift): MIT, SwiftPM `AGUICore`, `AGUIClient`, `AGUIAgentSDK`, `AGUITools`; `HttpAgent` defaults to `/run`. Viable second candidate, but OpenBot's CopilotRuntime path/auth/continuation differs from a plain agent. README says iOS 15+, manifest specifies iOS 16+; trust manifest.
3. Official AG-UI public SDK matrix lists TypeScript, Python and .NET first-party with community implementations in other languages; no Swift production support guarantee. See [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) and [AG-UI guide](https://www.copilotkit.ai/blog/developers-guide-to-the-ag-ui-protocol).

**Decision gate:** On user's Mac, pin immutable candidate SHA, compile SDK for iOS 27, run authenticated `/info` + actual run fixture, verify streaming, tool result, approval interruption/resume, event preservation, cancellation, and cross-launch history. Decide whether a thin OpenBot adapter suffices. Do not write a second AG-UI transport stack merely because adding a package is unfamiliar.

## Security / non-goals

- Reject arbitrary non-HTTPS remote deployments; loopback HTTP only for local debug testing. No blanket App Transport Security bypass.
- OAuth is handled with Apple AuthenticationServices and the **server's documented flow**; session tokens only in Keychain, no logging tokens/headers, no secrets as query parameters. Expo plugin activation must be checked on the deployment.
- No server key in `Info.plist`, repo, logs or simulator defaults. No hard-coded bot permissions, remote tool authorization or effect classification.
- Treat all server and model content as untrusted. Native rendered catalogs must respect their schemas; arbitrary model HTML may use a documented isolated WKWebView exception, never as main UI.
- Original React, Expo, desktop, backend, CI, migrations and agent files remain untouched.
- No redesign, fake messages, stub tools or "parity" badge in Phase 1.

## Deployment / licensing

Root `LICENSE` is MIT; verify all *transitive* dependencies, component/gallery assets, model providers and external services before product distribution. OpenDuet's README requires Docker, Bun, model API credentials and a CopilotKit Intelligence project. Native distribution additionally requires Apple signing/provisioning and an accessible HTTPS deployment, with native OAuth callback compatibility and Apple push-provider decisions separately verified. Repository contents are not evidence that those services are deployed or funded.

## Open M0 questions requiring architecture reviewer

1. Confirm supported deployment URL, Better Auth native callback handshake and any allowed native identifier/scheme. Expo's `EXPO_PROJECT_ID` gate is source-proven, native Swift transfer is **not**.
2. Choose AG-UI Swift SDK after executing comparison tests, not by name alone.
3. Determine the exact v2 CopilotKit runner URL discovered via `/info`, auth header/cookie flow and documented tool-result/run-resume semantics.
4. Decide native renderer boundary for A2UI and generated HTML without reducing capabilities.

**No M1 end-to-end proof is claimed by this audit.**


## M1-A candidate revision pins and observed gap

- `mattsp1290/ag-ui-swift` main on audit: `9412aab2549e06e165ada85fe6346b9b6e5a0f2b`. SwiftPM includes `AGUICore` and `AGUIClient`, bounded SSE transport. No dedicated CopilotKit Intelligence realtime WebSocket client identified in the manifest/source tree. **Evaluated from source, NOT compiled with Xcode or integrated.**
- `paduh/ag-ui-swift` main on audit: `659aa553ceb6893cd834874f3d1b9bf5cde31959`. SwiftPM includes `AGUICore`, `AGUIClient`, `AGUIAgentSDK`, `AGUITools` and an SSE `HttpAgent`; its default run route is `/run`, not CopilotKit's `/agent/:agentId/run`. No runtime Intelligence WebSocket bridge identified in the library sources. **Evaluated from source, NOT compiled or integrated.**
- **No SDK selected or added.** The first spike must validate the JSON run admission + token-bearing realtime join and historical event replay against actual OpenBot, including frontend tool-result and approval resume semantics. Apple's `URLSessionWebSocketTask` may be the transport if existing SDKs cannot bridge it, but do not implement or credential it until live admission and realtime shapes are verified.
