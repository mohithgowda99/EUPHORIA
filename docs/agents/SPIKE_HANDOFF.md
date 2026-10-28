# EUPHORIA phase-one handoff

Updated2026-10-28. Current work is on `feature/agents-native-visual-contract-spike`, based on9e62bfd. Main and OpenBot/CopilotKit remain untouched.

Phase one ports OpenDuet behavior to SwiftUI and uses OpenAI Agents API for intelligence. Phase two applies ETERNAL's visual interface. Phase one is unfinished.

## What works locally

- Existing five-type native fixture renderer is shared with the gateway session proof; no second renderer or WebView.
- Debug **Open gateway session** sends a real HTTP request, renders a validated surface, persists local form drafts/intents, and sends source-equivalent choice/form/approval responses. Manual Refresh follows subsequent provider calls.
- Node gateway enforces injected identity and session ownership, validates the canonical JSON Schema via AJV, assigns revisions and journals requests/actions in SQLite before sending. Repeated/concurrent accepted intents do not repeat writes. Lost outcomes are retained, never blindly replayed. Explicit recovery safely cancels unreceived submissions using durable tombstones.
- Accepted/inactive decisions remain locked. Native session switching cannot expose the previous session's controls. Old native archives remain readable.

## Verification

28 gateway tests,19 portable Swift tests,12 iOS tests, Debug/Release and plist checks passed. Native explicit QA flow: request → choice → form draft → termination/relaunch → restored draft → submission → approval decline → idle. Fixture server checked each of3 outputs exactly once. No OpenAI request or external task executed. Evidence and caveats: `TEST_EVIDENCE.md`.

## Boundaries

The real launcher is loopback-only with an explicit development bearer token; production Sign in with Apple/token verification and cloud deployment are not implemented. The proof uses single-process SQLite and manual refresh, not distributed storage or streaming. Native account setup, conversation/history, full basicCatalog/page/browser/bot/skill/files/integration/routine parity remain unfinished. One active choice/form/approval per tool call, with optional read-only context, is the connected subset. Approval-note drafts remain a deferred continuity gap.

Personal archives remain on-device. Submitted context/provider history are remote data; gateway stores minimal ownership and active operation state. No cloud vendor has been selected. Credentials are server-only; none bundled in iOS. Lack of a key blocks live verification, not local implementation.

Next: native conversation/history and further source-component parity through the existing boundary, followed by real-provider acceptance when configured. Gateway run/QA instructions: `../../gateway/README.md`. Full source inventory: `NATIVE_VISUAL_PARITY.md`. Never mark phase one complete from fixture results.
