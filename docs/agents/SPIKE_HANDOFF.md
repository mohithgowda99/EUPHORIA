# EUPHORIA phase-one handoff

Updated 2026-10-28. Work lives in the real Xcode project on `feature/agents-native-visual-contract-spike`. Baseline `de9d990`; this change adds an internal provider transport and stronger native persistence evidence. Main and the existing CopilotKit/OpenBot implementation are untouched.

## Target

Phase one ports OpenDuet functionality to SwiftUI and replaces its intelligence backend with OpenAI Agents API. Phase two evolves the interface into ETERNAL's Home/Workspace/Focus/Orb experience. Five native fixture types are an implemented subset, not full OpenDuet or A2UI parity.

## Implemented

- Five source-derived native controls: choice, form, approval, reporting checklist, editable page checklist.
- SwiftData saves visual surfaces, drafts and queued intents; local approvals do not execute effects.
- `gateway/agents-client.mjs`: server-side session creation/retrieval, user messages and pending function results. Explicit model, beta header, stable submission keys, current required-action identity and no automatic write retries. No dependency or public server added.
- Empty202 event acceptance is handled separately from completion; provider errors are sanitized. Gateway authentication and action authorization must precede use of this transport.

## Verified

Debug/Release builds, built-plist checks, 9 iOS XCTest, 8 portable Swift XCTest, and12 local HTTP provider-contract tests passed. Native Team name draft and pending Staging choice survived app termination/relaunch. See `TEST_EVIDENCE.md` for commands, artifacts and limitations.

## Data and identity direction

The user prefers personal app records to stay on-device. Preserve that default; sending selected context to a cloud model still creates remote session data. Keep only required server ownership, credential and operation state for remote work. Unattended execution requires server state while the app is closed. Sign in with Apple is a proposed identity mechanism; it must be verified by a server and is not implemented here. No cloud database or auth vendor has been adopted.

## Remaining

There is no public gateway, live agent session, native transport connection, streamed model-generated UI or complete source parity. Provider adapter tests use a local stub. A key is deferred by the user; continue implementation, then verify live access separately.

Next: authenticated owner/session boundary + validated surface/action round trip using the existing renderer. Preserve provider turn/call IDs and durable action intents; never replay uncertain effects. Source capability inventory and visual schema are in `NATIVE_VISUAL_PARITY.md`; internal adapter instructions are in `../../gateway/README.md`. Deployment and full capability migration remain unfinished.
