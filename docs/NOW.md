# Current state — 2026-10-28

Project: EUPHORIA. Branch: `feature/agents-native-visual-contract-spike`. Latest implementation `511b6a9`, following `8e20317`. Inspect Git for the documentation HEAD. Phase one remains unfinished.

Native sessions now follow authenticated gateway SSE projections of the existing surface, history and input receipts. Provider events trigger canonical reads; raw event bodies never reach the app. Foreground selected-session subscriptions reconnect and restore without resending messages, approvals or tool results. Persistent publication ordering rejects stale envelopes; updates wait behind local writes. Live history merges preserve older pagination and completed entries. Same renderer, SwiftData container and SQLite journals; no new dependency/store/runtime.

Independent Terra/medium review completed. One regression-driven pass fixed pagination frontier reset and snapshot/history/receipt coherence: projection reads use the existing session lock, never held for subscription lifetime. This also prevents transient submitting receipts from entering native decoding. Draft preservation and cross-session/stale-publication rejection have native tests.

Executed: **63 gateway tests,49 Swift core tests,20 iOS XCTest**, zero failures/skips; Debug/Release/plist gates passed. Labelled local Simulator QA: request → Training → automatic form without Refresh; process relaunch → restored form and live connection. Further keyboard automation inconclusive; no full new manual form/approval/gallery trace claimed. No live OpenAI request, token-delta rendering or real external effect verified. Local QA server stopped.

**Next:** continue the remaining source A2UI composition/binding parity using the existing native renderer while the user obtains credentials. Once available, run the real-provider vertical journey: request, streamed updates, interactive UI, tool-result continuation, cancellation and authoritative relaunch restoration.

Remaining closure milestones: token-by-token text, broader A2UI/nested/shared bindings and dynamic grants/rich pages; usable native navigation plus tasks/bots/skills/memory/channels/media/routines/notifications/team/admin; integration credentials and real computer/browser/file/command/approval executors; production identity/deployment/background service state; full failure/recovery/account/device acceptance. Full source parity remains substantial product work.

Details: [handoff](agents/SPIKE_HANDOFF.md), [evidence](agents/TEST_EVIDENCE.md), [parity ledger](ios/FEATURE_PARITY.md), [live-stream design](superpowers/specs/2026-10-28-live-snapshot-stream-design.md).
