# EUPHORIA M1-A evidence and blockers, 2026-10-27

**Review authorization:** M1-A only. **Previous reviewed SHA:** `21042884289d320a27069694f7c252675bc33b99`. **Branch:** `feature/ios-native-m0-m1`. **Baseline:** `5b0e15f9719db0628c02a3fe6386dcad683c8302`. No backend edits, no agent/tool stubs, no redirection to a new agent framework.

## 2026-10-27 reviewer validation update (supersedes the *historical* Linux-only status below)

Operator-reported execution at reviewed SHA `96372aec7fd84bb65804107bf807cb4d39e1c664`, on **iPhone 18 Pro Max / iOS 27.0**:

| Task | Evidence | Interpretation |
|---|---|---|
| Debug simulator build | PASS, user report | Validated on the user's Mac; not independently executed here |
| Release simulator build | PASS, user report | Validated on the user's Mac |
| XCTest | **6 run, 0 failures**, user report | Source suite validated by operator |
| Original script | Exit `0`, user report | No errors reported |
| Original logs | `/Users/mohithgowda/EUPHORIA/ios/.build-logs` | Mac-local generated files; not attached or remotely readable here |
| XCTest counts from `.xcresult` | **NOT YET EXTRACTED** | New verification script emits and checks bundle counts when rerun |
| ATS simulator-to-real-server smoke | **NOT REPORTED** | Built Info.plist alone does not prove network behavior |
| Authenticated real agent | **NOT RUN** | M1-A remains open |

No source files were changed by the operator's validation; generated logs should remain untracked. The new reviewer corrections are captured in `docs/ios/M1_PROOF_PLAN.md`; both runtime entitlement readiness and per-thread ownership isolation are security/acceptance gates. **The following original Linux investigation section is kept as historical context, not the current Xcode outcome.**

## Step 1: Xcode foundation evidence (historical Linux executor)

Run environment was Linux x86_64 with Swift 6.2.1; `xcodebuild`, `docker`, `bun` were absent; shell DNS to github.com unavailable. There is no Xcode/iOS SDK or iOS Simulator, so **no iOS Debug/Release build, XCTest run, signing check or localhost/ATS runtime test was possible here**. These tests are **BLOCKED**, not passed.

Performed a strict Swift 6 portable compile and executable assertions against a faithful local copy of `ios/EuphoriaApp/OpenBotEndpoint.swift` (not an Xcode test run). Commands:

```sh
swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors -D DEBUG OpenBotEndpoint.swift main.swift -o corechecks && ./corechecks
swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors OpenBotEndpoint.swift main.swift -o corechecks-release && ./corechecks-release
```

**Result:** both commands exit 0, seven hand-written behavior assertions each; validate HTTPS origin normalization, rejection of credential/path/query/fragment/remote HTTP inputs and capability JSON decoding. These are **not** source-controlled XCTest execution; the XCTest target still has six test methods under Debug (`testAllowsDebugLoopbackOnly` is conditionally compiled), five under Release. Do not present these as successful simulator/XCTest results.

**ATS source correction:** Added a Debug-only Info.plist with `NSAllowsLocalNetworking=YES` for the existing loopback diagnostic. Production Release keeps generated Info.plist and default ATS. Confirm resulting Info.plists with `plutil -p` on the Mac; verify loopback by real HTTP GET and remote HTTP rejection in both configurations. The allowed Debug loopback hostnames in the client are `localhost`, `127.0.0.1` and `::1`, not arbitrary LAN IPs.

**Mac execution:** Set an installed iOS 27 simulator UDID via `EUPHORIA_SIMULATOR_ID` and run `bash ios/scripts/verify-xcode.sh`. Record xcodebuild version, actual SDK, Debug/Release outcomes, XCTest executed/passed counts, and ATS behavior. Until then Step 1 is incomplete.

## Step 2: Existing test deployment

Root README at audited baseline specifies Docker, Bun >=1.3, Node/npx, CopilotKit Intelligence project (required), model provider API key, and scripts `bun install`, `npx --yes copilotkit@latest login`, `npx --yes copilotkit@latest project select`, `bun openbot/scripts/setup-learning.ts`, `bash scripts/start.sh`; default web `localhost:3010`, server `localhost:3001`. `scripts/start.sh` boots Postgres, Bot computers, migrations, API, worker and app. Never print, include in traces or commit `.env`, model keys or Intelligence tokens.

**Critical auth distinction:** default `OPENBOT_SINGLE_USER=true` is suitable for loopback smoke checks but **cannot prove a real native OAuth/SSO login**. A separate configured identity-provider deployment is needed for Step 3, with HTTPS reachable from the simulator/device. `EXPO_PROJECT_ID` controls the existing native Expo plugin gate. No deployment was started here: no Docker/Bun, user credentials or active service URL were provided.

## Step 3: Better Auth native contract inspection

- Server `openbot/server/src/auth/index.ts` uses Better Auth `expo()` **only if** `EXPO_PROJECT_ID` is nonempty. Only then `openbotmobile://` is trusted as the native callback origin.
- Existing Expo app `openbot/mobile/src/auth.ts` uses `expoClient()`, SecureStore, `signIn.social` and `signIn.sso`. Expo client combines a verified browser callback with cookie handling and appends the cookie manually in its `src/api.ts` request helper.
- Server `createRequireUser` calls Better Auth `getSession` and enforces an actor role; `GET /api/me` requires that guard. No client-side role flag can substitute.
- The desktop `/api/auth/desktop` flow is a localhost **desktop-only** transfer with a PKCE-style challenge, `openbot-desktop` client ID, loopback `/organization-auth/callback` and the existing Electron transfer plugin; it **must not** be reused for an iOS callback.
- Better Auth Expo's official client processes the OAuth return and securely retains a session cookie; its mobile-specific behavior is not performed by Apple `ASWebAuthenticationSession` automatically. See https://better-auth.com/docs/integrations/expo and https://github.com/better-auth/better-auth/blob/main/packages/expo/src/client.ts.

**Decision required:** confirm the supported Better Auth native session/callback contract on a running test deployment. Existing `openbotmobile://` is an unverified fit for this Swift bundle and has collision/callback-security implications. No new cookie transfer, bypass or iOS sign-in handler has been coded; implementing it without a verified response and reviewer decision could weaken auth and fail parity.

## Step 4: Swift AG-UI client source comparison (not runtime spike)

| Candidate | Immutable snapshot inspected | Existing client | Major OpenBot gap | Status |
|---|---|---|---|---|
| `mattsp1290/ag-ui-swift` | `9412aab2549e06e165ada85fe6346b9b6e5a0f2b` | `AGUICore` event models + `AGUIClient` bounded SSE HTTP client, cancellation | No demonstrated Intelligence JSON-admission + join-token WebSocket flow | **Not selected / not compiled for iOS** |
| `paduh/ag-ui-swift` | `659aa553ceb6893cd834874f3d1b9bf5cde31959` | `AGUICore`, `AGUIClient`, `AGUIAgentSDK`, `AGUITools`, `HttpAgent` default `/run` | No demonstrated CopilotKit v2 runtime multi-route+Intelligence realtime client | **Not selected / not compiled for iOS** |

**Key correction:** Existing OpenBot uses CopilotKit Runtime **always in Intelligence mode** (`openbot/server/src/copilot.ts`). CopilotKit v2 multi-route `POST /api/copilotkit/agent/:agentId/run` returns JSON with `joinToken`, `realtime.clientUrl` and `realtime.topic`, then sends AG-UI events over an Intelligence WebSocket; `POST .../connect` resumes admission. An SSE-only SDK can validate event decoding but cannot complete the native conversation by pointing `HttpAgent` at the runtime. Reference: https://docs.copilotkit.ai/ms-agent-python/backend/runtime-endpoints. This is documentation/source evidence, **not** a sanitized live protocol trace from this user's deployment.

**No AG-UI package added:** SDK selection remains blocked on authenticated runtime and WebSocket traces. Native `URLSessionWebSocketTask` is an Apple-provided building block but should not be wired to undocumented join-frame shapes.

## Step 5: End-to-end acceptance status

**NOT RUN / NOT IMPLEMENTED:** authenticated `/info`, server-minted thread, Intelligence WebSocket run, incremental model output, real frontend tool result, computer approval 202 interruption/server continuation, cancel/run stop and persisted history after a true app relaunch. No fake tool responses or transcripts were used.

## Protocol trace placeholders (actual traces, sanitized, required later)

```text
GET /api/me -> [401 | 200 actor role, no identifiers]      NOT CAPTURED
GET /api/copilotkit/info -> [status, advertised mode]       NOT CAPTURED
POST /api/copilotkit/agent/:id/run -> [JSON fields only]   NOT CAPTURED
WS join -> [event kinds, sequence/size, no joinToken]      NOT CAPTURED
Frontend tool -> [name, args schema, result type]          NOT CAPTURED
Approval -> [202, decision, server-run resume, audit]     NOT CAPTURED
Relaunch -> [history events, message count, thread match] NOT CAPTURED
```

## Reviewer decisions before next code

1. Run Xcode builds/tests and ATS smoke checks on Mac, fix any actual failures.
2. Choose a test environment with Docker, Intelligence, model key and configured OAuth/SSO. A local single-user smoke server alone will not establish native auth.
3. Approve validated native Better Auth flow, then pick SDK components only after observing the actual Intelligence WebSocket admission/join contract; may use `AGUICore` without shipping `HttpAgent`.
4. Preserve current scope, original backend, all React functionality and main unchanged. Do not advance to screens.

## Corrections commit: post-review scope and evidence

- Added `/ios/.build-logs/` to repository `.gitignore`; existing untracked build logs stay on the operator's Mac and do not belong in commits.
- Enhanced Xcode verification: build-product plist validation, explicit `.xcresult` bundle and machine-readable counts. This updated script is **NOT YET EXECUTED** on macOS; the prior 6-pass report applies to the earlier commit/script.
- The runtime entitlement status and cross-user thread endpoint checks are now required before any native streaming implementation claims parity. The runtime's own documentation warns `events`, `state` and `stop` may be ID-only. OpenBot global `/api/*` authentication does not establish per-thread authorization. **No backend code was changed; review-required potential security gap.**
- No authenticated session, live AG-UI trace, tool invocation or approval continuation was captured. No new Swift agent or transport code was added.
