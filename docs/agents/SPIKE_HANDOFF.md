# EUPHORIA phase-one handoff

Updated 2026-10-28. Branch `feature/agents-native-visual-contract-spike`, latest implementation `5e5d6e0`, following `a81d2cb`. Main and OpenBot/CopilotKit are untouched.

Phase one ports OpenDuet functionality to iOS with OpenAI Agents API behind an authenticated gateway. Phase two applies ETERNAL's visual experience. **Phase one remains unfinished.** User approved isolated generated HTML artifacts on 2026-10-28; the shell and standard interface remain native SwiftUI.

## Current nested/live milestone

User configured the ignored server key and chose gpt-6-luna. Nested object paths normalize through the same native form contract with bounded replacement semantics. Shared control aliases/relative/array paths still fail explicitly. Unsupported render calls can receive bounded durable error feedback via existing action journal; no automatic retry after uncertain delivery and no false decision acknowledgment. Review identity bypasses are fixed and covered.

77 gateway /49 core /20 native tests, Debug/Release/plist gates pass. Real positive journey: gateway HTTP request → corrected supported choice → native Staging tap → real completed response → locked/idle/live relaunch. Real negative journey: native-created request's malformed-render error delivery uncertain and not replayed. Next is diagnosing that delivery case and accepting a fully native-created journey; full parity remains open. See TEST_EVIDENCE.md before any live capability claim.

## Live follow milestone

Native foreground sessions subscribe to the owned bounded gateway SSE feed. Provider events are notifications; the gateway reads coherent canonical surface/history/receipts under its existing session lock. Persistent publication ordering and native busy buffering prevent stale mutation rollback. Reconnect resubscribes before restoring and never replays input; EOF is not turn success. Older pagination and completed history survive live updates. Not token-by-token text streaming.

77 gateway /49 Swift core /20 native tests and Debug/Release/plist gates pass. Independent review fixes are covered. Simulator confirmed automatic choice-to-form and relaunch live restoration; full keyboard form flow remains inconclusive. The broader actual-provider acceptance gate remains open; bounded positive/negative traces are recorded above.

## Implemented locally

- Shared native decisions/forms/checklists plus records, metrics, notices, sortable tables, bar/pie/line/area charts and progress. Version 2 adds gallery/HTML nodes; old version 1 archives remain readable. This is an adapter contract, not full A2UI.
- Approval-note drafts now live in existing revision-scoped persisted visual state. Reopening restores them. Pending and completed decisions lock edits; malformed notes are rejected.
- Same-session follow-up, cancellation, owned session list and paginated provider history. Input intents persist before HTTP. Unknown outcomes remain blocked without replay; definitive rejection is terminal. Latest history refresh preserves cached older pages, including gaps larger than a page.
- Same SwiftData container holds account-scoped native history projections and input intents. SQLite retains ownership, source surfaces and operation receipts. No separate profile/domain system.
- Read-only results use a durable display acknowledgement rather than inventing a human question. Rejected unreceived receipts can be acknowledged again; widgets remain usable after acceptance.
- Generated HTML/JS uses unique isolated origins and ephemeral WKWebView stores. CSP blocks external network, frames, workers, forms and objects. No native bridge or credentials; navigation, popup, file and device permissions are denied. WebRTC/WebTransport constructors are removed before artifact code. This intentionally does not grant arbitrary online artifact access.

- Source A2UI v0.9 form adapter: strict Card/Column/Text/TextField/Button shape normalized into existing askForm. Flat text/boolean/string-list defaults and bindings, source event context and timestamp, revision-scoped drafts, empty/whitespace preservation and shared Unicode limits are verified. Native Toggle and single/multiple labelled selection controls preserve actual source data types. No full catalog/interpreter or new runtime dependency.

## Verification

Current counts and commands are in `TEST_EVIDENCE.md`. Real WebKit execution checks inline interaction, blocked fetch, bridge absence and origin/state separation. On-disk SwiftData tests verify note and conversation recovery. Native controls QA on the final build verified boolean/single/multiple edits, relaunch recovery, local submission and persisted control locks. The full gallery/live-provider native flow remains unverified. Do not substitute unit tests for that missing trace.

## Required remaining implementation

Remaining A2UI data bindings/actions and dynamic per-Bot grants; rich page blocks; tasks/routines/responsibilities/notifications; bot/skill and memory management; channel/group/attachment/voice behavior; integration grants/OAuth/credentials; computer/browser/files/commands and server-owned approvals; production identity/deployment/admin; streaming and authoritative reconciliation of genuinely uncertain provider effects. See the complete source inventory in `../ios/FEATURE_PARITY.md` and capability map in `NATIVE_VISUAL_PARITY.md`.

These are code and service gaps, not all API-key blockers. A key is needed only for real-provider acceptance. No real OpenAI request or external action has been verified. Development bearer identity and single-process SQLite are not production authentication or distributed execution.

Independent review resumed and completed; Unicode wire-identity and explicit-null defects were fixed with RED→GREEN regressions. Fresh52 gateway/45 core/18 iOS tests and Debug/Release pass. Next: a real streamed native agent journey and authoritative reopen through the existing gateway, with live credentials for acceptance. Broader UI/workflow/service parity remains required; see the recommended closure order in FEATURE_PARITY.md. Do not restart or adopt another runtime merely to expand the catalog.
