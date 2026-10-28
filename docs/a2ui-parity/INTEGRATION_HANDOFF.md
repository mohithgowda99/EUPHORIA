# A2UI branch integration handoff

Source branch `feature/native-a2ui-genui-parity` at `29e80e0` is integrated into `feature/agents-native-visual-contract-spike`. Main is unchanged. This is a bounded native composition study, not complete protocol or live-agent parity.

The incoming eight-component value model, recursive SwiftUI renderer and two source-shaped graphs are registered in the actual Xcode target and Development tools. A contained `sourceComposition` node uses existing VisualState.values, pending actions and VisualSnapshot/SwiftData. Draft documents are derived, not independently stored. Button context is recomputed and checked against the canonical graph. Pending submission locks edits; revision replacement discards obsolete scoped drafts.

Integration fixed a real SwiftUI recursive opaque-return compilation failure, pinned catalog mismatch, invalid initial/shared choices, Unicode identity, repeated structural references, unbounded properties/drafts and a node-ID/draft-key collision. Independent Terra/medium review was followed by a reproduced regression and fix. Existing WebKit artifact policy and bridge remain unchanged.

Executed on macOS/iOS27: **85 gateway tests, 71 Swift core tests, 25 iOS XCTest**, all passing, plus Debug/Release/plist gates. On-disk SwiftData reopen preserves shared draft and pending event. Simulator native keyboard editing updated both shared text presentations; confirmation queued exactly once, disabled controls, and preserved text/pending state after termination/relaunch. Deployment-choice fixture is compiled and covered by core tests; separate manual choice-study acceptance was not run.

No paid API calls or key use. Live gateway intentionally rejects the native-only sourceComposition kind. Its existing source-form adapter stays unchanged. Remaining: server-side graph normalization/validation and authorization, actual tool-call/event continuation, full streaming protocol semantics and missing catalog components. Do not infer live graph execution from local fixture acceptance. Historical provider uncertainty remains unresolved; see NOW and TEST_EVIDENCE.

## Backend follow-on —7c9d765

The gateway now admits explicit validated a2uiGraph packets and authorizes native submitForm context using existing journal and pending provider call. Direct sourceComposition provider nodes still cannot bypass graph normalization. See versioned docs/contracts/a2ui-graph-v1.md and fixtures.119 gateway/71 unchanged Swift core tests and Swift contract consumer pass offline. Live provider/native graph acceptance remains open; earlier statement that all live graph admission is gated describes the preceding milestone. Full source parity is still unimplemented.
