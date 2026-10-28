# EUPHORIA checkpoint — 2026-10-28

**Active source:** `feature/phase1-reuse-first-integration`; recoverable prior backend/UI/A2UI branches preserved. **main not changed.**

**Goal:** original OpenDuet product as a native SwiftUI iPhone app, with managed OpenAI Agents API eventually replacing the CopilotKit Intelligence execution boundary. Original source controls user identity, Bots, conversations, tasks, memory, permissions, skills, connected apps, routines and Make; use managed Agents for execution only where proven equivalent.

## Native source-service integration implemented this checkpoint

- `ContentView` now has **native Chat / Tasks / Bots / More**. Chat uses original `/api/delivery/conversations` and `/api/channels`, NOT the gateway session roster. Real conversation creation, history, Bot choice and native message submission use original DeliveryStore/Router and the same `externalId` dedup contract.
- Original Bot source APIs back native list/create/edit/hide/pin/duplicate/delete, per-Bot skills and tool grants. The original `PluginStore` remains the only permission authority.
- Original TaskStore APIs back the native lifecycle sections, source TaskRecord detail/ownership/Bot identity, task discussion, reply, resolve/reopen and source report. The transitional gateway Tasks page stays **Debug-only**. Source task creation lacks idempotency support: a persisted local intent blocks automatic retries on a lost response.
- Source MemoryStore edit/confirm/enable/delete, ApprovalService inbox/questions/deny, Routines original metadata/run-history/safe pause, original Make PageStore/gallery native block presentations with optimistic checklist revision, connected-account status. Rich SVG and several complex page shapes are still marked unsupported.
- Original Better Auth `expo()` OAuth callback reused in SwiftUI via `ASWebAuthenticationSession`: native `openbotmobile://` scheme, same-origin `expo-authorization-proxy` + OAuth-state cookie, `expo-origin`, original `get-session` verification, session cookie in device-only Keychain. Original server now allows explicitly opting into this callback via `EUPHORIA_NATIVE_IOS_AUTH=1` without requiring an Expo client. Server defaults to refusing the callback when neither Expo nor this flag is set.
- All source API work is inside the existing server and native client; **no new provider runner, task engine, scheduler, plugin framework, approval engine, memory database or paid model usage**. Existing `GatewaySessionModel` and its OpenAI Agents API client remain available under Debug development tools, not silently deleted.

## What is **NOT** proven or complete

- **Fundamental execution gate:** the original OpenDuet `index.ts`, `copilot.ts`, `toolkit/run-turn.ts` and history/locks still depend on **CopilotKit Intelligence**. The new native source-backed screens **do not yet execute those original Bots through OpenAI Agents API**. The transition gateway can execute OpenAI sessions but is not integrated with original Bot/Channel/TaskStore ownership. Avoid saying the final product or original-agent execution journey works.
- The source service must be deployed with HTTPS, Postgres, account OAuth/SSO credentials and an enabled native callback; no real production deployment or user login has been tested. Authentication and data isolation are server-enforced but need an actual signed-in iPhone run. APNs, background push, managed Automations, hosted computer/MCP delegation, interactive open-ended generated UI and full source parity remain unimplemented or unverified.
- The mature community `a2ui-swift` renderer remains a pinned nonshipping spike; full A2UI v0.9 runtime conformance and migration still require tests.
- **No Mac/Xcode or physical device** available in this session. The new native files, new source auth test, and `SourceOpenDuetTests.swift` are committed but **not compiled/executed**. Full original Bun/Postgres regression, gateway Node24+, Swift packages, Debug/Release, iOS Simulator and real-provider workflows must be run on the Mac. Historical test counts from earlier branches are not evidence for this head.
- This environment cannot read uncommitted Mac worktrees and did not inspect/overwrite them. No paid OpenAI calls, production environment changes or main merge.

## Executed checks

- Remote GitHub source audit against actual `/api/agents`, `/api/openduet/tasks`, `/api/delivery`, `/api/approvals`, `/api/memory`, `/api/plugins`, `/api/routines`, `/api/openduet/pages` and Better Auth Expo implementation.
- Structural check over remote tree: **22/22** verified source/Xcode target registration, source UI navigation, SwiftData journals, URL scheme and duplicate-PBX-ID checks. This is **not** Swift compilation or runtime acceptance.
- Added unexecuted Xcode tests for real source DTO/route shapes, HTTP 204, native OAuth callback/state proxy, Bot permissions, memory/approval routes, deduplicated native delivery, original TaskStore create/reply and locally saved intent restoration; added original Better Auth opt-in server integration tests.

**Single next acceptance path:** Mac checkout with uncommitted-work preservation; run original Bun typecheck/tests and Node24 gateway tests, `xcodebuild` Debug/Release + simulator XCTest, fix compile/runtime issues. Then implement a **small managed Agents provider adapter for original source CopilotKit conversation/headless-turn/lock/history seam**, preserving original Bot/TaskStore/Channel/Approval authority. Verify a genuine account/Bot Chat → Task → native A2UI → answer → report → relaunch trace, before retiring transitional gateway and shipping externally reachable hosting/notifications.

Reference: `docs/architecture/MANAGED_FIRST_REUSE_AUDIT.md`, `docs/phase1-ui/OPENDUET_SOURCE_FIDELITY_LEDGER.md`.
