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
