# EUPHORIA M1 authenticated integration proof contract

**M1 is blocked until a real OpenBot HTTPS deployment and a native Better Auth transfer mechanism are validated.** The initial foundation deliberately does not manufacture an authenticated session, submit messages or register placeholder tools. Do not label the foundation "M1 proven".

## Required single vertical-slice test (real server, same Bot, same durable thread)

1. **Authenticate:** use server-advertised provider (including SSO when required) through Apple AuthenticationServices; deliver server-issued session to URLSession in a verified, secure way. Assert `GET /api/me` returns the expected actor; logout/restart/revocation must revoke native access. Verify /api/copilotkit/info under same session.
2. **Run and stream:** on a server-minted thread (`POST /api/threads/mint`), execute a real AG-UI run through the existing CopilotKit runtime (not a direct model API). Assert start, incremental assistant content, end, finished, IDs, ordering, errors and cancellation are handled correctly.
3. **Frontend tool:** enable one source-defined, non-mutating frontend tool on the same Bot; capture its name/args from the run, execute its real authorized handler once, return its result in the correct protocol continuation, verify server sees the actual result. A mocked echoed value is **not** enough.
4. **Approval:** run a source-defined mutating computer tool under a policy that requires approval. Capture the actual `POST /api/approvals/computer/:botId` 202, stop current run, decide the approval via server endpoint, assert **only server executes** and resumes it, trace one audit/effect and final answer; test reject/cancel too.
5. **Reopen:** terminate and relaunch native app, restore real authenticated identity and thread; load `/api/threads/:threadId` and stored messages/queued turns, confirm user/assistant/tool/approval history present and correctly ordered. Do not create a second thread when history is temporarily unavailable.

## Automated fixtures and non-happy paths

- SDK compliance fixtures: SSE multiline/fragment boundaries, partial UTF-8, malformed JSON, 401/403/429/5xx, response type mismatch, run start/end, out-of-order and duplicate events, toolArgs fragments, toolResult correlation, state deltas, unknown custom/activity events.
- Lifecycle: user cancels mid-stream, socket disconnects, process dies during approval, server resends event, UI reopens on persisted thread, stale connection finishes after new selection. A retry must not duplicate a side effect.
- Auth: OAuth callback mismatch/nonce invalidation; expired session, SSO-only org; URL host changes must not reuse Keychain material.
- Approval: false/unavailable Bot, concurrent pending decisions, refusal, 202 stop, idempotent continuation, zero client-side side-effect replay.

## Validation commands once on the Mac

```sh
xcodebuild -list -project ios/Euphoria.xcodeproj
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test
```

Pick an actual installed iOS 27 simulator in Xcode rather than assuming the example device is installed. Then run live-server proof on simulator/device with a dedicated test account, Bot, model credential, Intelligence workspace, approval policy and computer. Save sanitized traces, server version, SDK SHA, test account role and commit in the milestone report. **Do not disclose tokens or credentials in evidence.**

## Approval-required technical choices

- Better Auth Expo-based native auth vs verified alternate pre-existing native transfer flow, and whether existing server configuration supports Swift callback without backend change.
- AG-UI package revision: candidate A `mattsp1290/ag-ui-swift`, candidate B `paduh/ag-ui-swift`; integration spike first, zero new transport layers unless gaps are documented.
- Source-defined frontend tool to prove first: prefer `list_bots` only when bot-creator grant makes it available; verify handler and AG-UI result continuation. Approval: choose a safe local computer-action fixture with permission checks.
- A2UI/generated HTML exception: approve explicit sandbox boundaries and tested deep-link/navigation behavior before adding WKWebView.

## Deliverable standard

For each checkpoint: full commit SHA and changed files; implemented behaviors; existing React-equivalent behaviors proved by captured assertions; command and test counts; unverified matrix; security/licensing blockers; reviewer decisions; next slice. No declaration of feature parity before the complete ledger turns green.


## M1-A reviewer amendments (2026-10-27, after iPhone 18 Pro Max/iOS 27.0 validation)

### Runtime entitlement readiness: fail closed on non-ready

The source of truth is **the authenticated runtime** `GET /api/copilotkit/info`, not the public `/api/capabilities` response or HTTP 200 alone. A valid `/info` response can contain `runtimeEntitlements.status = "degraded" | "misconfigured" | "unavailable"` even when HTTP status is 200. An invalid Intelligence project key may produce status `misconfigured`, error code `runtime_entitlements_misconfigured`, and **HTTP 200**. Record the status and sanitized error code (never credentials). For any entitlement-gated requirement in the slice: require `status = "ready"`, verify the advertised feature and limit values are compatible with that requirement, and prove an actual permitted run; do not infer feature availability from `/info` alone. Absence of entitlement data, unexpected status, exhausted/unsupported applicable limit or an upstream error is **not readiness proof**. Core behavior may still function in degraded mode, but it cannot satisfy this acceptance gate. Also confirm `threadEndpoints` availability as needed; `inspectorMetadata` does not by itself prove readiness. Source: https://docs.copilotkit.ai/backend/runtime-endpoints.

### Cross-user, per-thread authorization: required negative fixture

CopilotKit's documented Intelligence default does **not** intrinsically authorize ownership for `GET /api/copilotkit/threads/:threadId/events`, `GET .../state` and `POST /api/copilotkit/agent/:agentId/stop/:threadId`: it may address threads solely by their IDs. OpenBot's app mounts CopilotKit behind `/api/*` session authentication and uses `identifyUser`, but **session validity and identity projection are not proof of ownership enforcement** for those three routes. Treat this as a security release gate, not a Swift-client-side guard. With two deliberately separate non-admin test accounts (Actor A owns real thread T; Actor B has a real independent session), and a fresh sessionless client:

| Operation against T | Actor A | Actor B | No session |
|---|---|---|---|
| GET runtime `threads/T/events` | Can read own events | Must be denied; no event/body leakage | Must be denied |
| GET runtime `threads/T/state` | Can read own state | Must be denied; no state/body leakage | Must be denied |
| POST runtime `agent/:id/stop/T` with `{"runId":"..."}` | Can stop A's disposable test run | Must be denied and **must not terminate A's run** | Must be denied |

Use a disposable test Bot and A's running fixture only; confirm A's run continues after B's forbidden stop attempt and that the unauthorized attempts generate no effect. Assert explicit 401/403 or a deliberate non-disclosing 404, not HTTP 2xx/204 or an event payload; compare per-route response semantics with server evidence. Also test allowed same-owner and wrong agent/runId handling. Never test unknown threads or another user's real conversations. If any cross-user request succeeds, **block M1-A** and request separate approval for a narrow server-side ownership guard. Do not patch, disable or replace the OpenBot backend under this authorization.

### Xcode results versus actual ATS network

Reviewer reported `96372aec`: iPhone 18 Pro Max on iOS 27.0, Debug build PASS, Release build PASS, **6 XCTest methods executed, 0 failed**, validation script exit `0`. This report is **external operator evidence**, not independently accessible from this environment: `/Users/mohithgowda/EUPHORIA/ios/.build-logs` is a local Mac path. The original validation script printed stdout without an explicit `.xcresult` bundle, so **historical xcresult counts have not been machine-extracted here**. Revised `ios/scripts/verify-xcode.sh` now emits a uniquely named `.xcresult`, uses `xcrun xcresulttool get test-results summary`, asserts exactly six passed and zero failures/skips, and verifies Debug vs Release *built* Info.plist ATS keys. Rerun after pulling the new commit.

**ATS simulator smoke proof (separate):** boot the stated iOS 27 simulator, start the actual local OpenBot server on port 3001 using the checked-in start script, launch the Debug Euphoria app, enter `http://localhost:3001` (and independently `http://127.0.0.1:3001`), tap Check deployment, and observe decoded capabilities with no ATS blocked-load diagnostic. Ensure server request logs show `GET /api/capabilities`. Confirm client rejects `http://<non-loopback-host>:3001` before network and that the Release app rejects even loopback plaintext. On a separate real HTTPS fixture check normal transport and TLS validation. Capture statuses and screenshots locally with tokens and identities removed. **A Mac-host `curl` cannot prove iOS app ATS**. Until observed on the simulator these checks remain PENDING.

### Authenticated live fixture sequencing

1. Start unmodified OpenDuet from repo root on Mac using existing Docker/Bun/Intelligence/model setup, validate public health and capabilities, **capture entitlement readiness** via `/api/copilotkit/info`; a single-user fixture proves only service reachability, not Better Auth.
2. Configure an actual OAuth/SSO deployment with two test identities and HTTPS. Validate native Better Auth browser return, storage, `/api/me`, session restore, logout and revoked sessions without designing a new cookie scheme.
3. Run the cross-account thread read/state/stop negative fixture before sending any agent tool approvals.
4. Spike pinned Swift AG-UI *event models* against the real runtime. Where necessary, prefer a minimal CopilotKit Intelligence transport adapter only after live JSON run/connect responses and **sanitized** WebSocket join/event framing are captured; no guessed join protocol or general-purpose agent stack.
5. Only then demonstrate the real nonmutating frontend tool, authorized approval interruption/server-only continuation, stop/cancel and restored history. Capture a trace consisting solely of response statuses, event names, redacted identifiers and ordering; never raw cookies, join tokens, model prompts or user content.

**Runtime reference:** https://docs.copilotkit.ai/backend/runtime-endpoints (Runtime entitlements and Thread authorization sections). **Mac result format:** `xcrun xcresulttool get test-results summary --format json --path <bundle.xcresult>`.
