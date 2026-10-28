# Current verification evidence — 2026-10-28

Latest implementation `c126000`, following `3b8941b`, branch `feature/agents-native-visual-contract-spike`. No API key, live OpenAI request or real external effect. Main and OpenBot are untouched. Phase one is incomplete.

| Layer | Executed | Result | Limit |
|---|---|---|---|
| Gateway/provider adapter | `node --test gateway/tests/*.test.mjs` | 42 passed, zero failed/skipped | Local HTTP/provider fixtures |
| Swift core | `swift test --package-path ios/VisualRuntimeCore --scratch-path /private/tmp/euphoria-core-build --disable-sandbox` with temporary module caches | 37 XCTest passed, zero failures | Contracts/state/client on macOS |
| Native | `EUPHORIA_BUILD_LOG_DIR=/private/tmp/euphoria-a2ui-verified EUPHORIA_SIMULATOR_ID=<installed iOS27 UDID> bash ios/scripts/verify-xcode.sh` | Debug/Release + plist checks; 17 XCTest passed, no failures/skips; xcresult Passed | No physical device/signing or actual provider |
| Shared gallery fixture | Passed gateway schema/semantic validator and Swift fixture test | All nine supported gallery kinds plus HTML; 10 nodes | Fixture validation is not live generation or manual visual QA |
| Current manual native QA | Request reached labelled localhost provider, Training choice accepted, refreshed into form | Real SwiftUI/HTTP + existing journal | Keyboard/input automation unreliable; no claimed full new gallery/manual flow |
| Prior native trace, base ccc37ca | Request → choice → form → decline → idle; form draft survived terminate/relaunch | Three source-equivalent results once each | Prior milestone evidence, not a fresh expanded-catalog trace |

## Behavior verified by tests

- Approval notes persist in existing revision-scoped values and survive actual on-disk SwiftData container reopen. Pending/resolved decisions lock edits. Malformed note values fail validation.
- Conversation inputs journal before submission, persist by account/session scope and reconcile without replay. Definitive provider rejection is terminal; uncertain effects stay blocked. Unknown tool data is represented by safe metadata, not forwarded arguments/results. Owner checks reject foreign history/input access.
- Latest-window history survives coding/reopen, retains older pages, and fills gaps larger than ten items in chronological order. No unavailable history is fabricated as an empty conversation.
- Native gallery data validates row widths, numeric values, pie bounds and series lengths. Table sorting handles numbers and stable ties. Version 1 compatibility and version 2 gating are checked.
- Read-only surface display is a durable shown receipt, not an invented question. Rejected unreceived display receipts clear the local marker so they can be acknowledged again.
- Real WKWebView tests run inline JavaScript and DOM interaction, observe CSP rejection of fetch, assert absent native bridge/network constructors, separate artifact origins and ephemeral session state, and verify permission delegates are actually registered.
- Starting a new conversation clears previous connection/history errors without exposing old records or controls.

## Failure evidence and review

Fresh independent Terra/medium review found stuck cancelled display receipts, stale first-page history and permanently stranded definitive input rejections. Regressions were observed failing, then fixed; the full suites passed. A further >10-item history-gap regression failed, then passed after anchored chronological merging. A native stale-error regression produced two actual assertion failures, then the complete 16-case run passed after the fix.

Initial WebKit permission callbacks compiled without satisfying optional Objective-C delegates. Runtime selector assertions caught it. Correct SDK actor/sendable signatures now conform and tests pass. Zero-test or failed attempts are not credited.

Manual automation sometimes reported successful taps/text without app changes. Assertions and screenshots were checked; unconfirmed interactions were not counted. Expanded end-to-end native visual trace remains required.

## Retained local artifacts, not committed

- `/private/tmp/euphoria-parity-verified-node.log`, `/private/tmp/euphoria-parity-verified-core.log`
- `/private/tmp/euphoria-parity-verified-native.log`
- `/private/tmp/euphoria-parity-verified/Debug-tests-20261028T100705-27175.xcresult`, Debug/Release build logs and summary
- RED logs: `/private/tmp/euphoria-parity-review-red-swift.log`, `/private/tmp/euphoria-parity-review-red-node.log`, `/private/tmp/euphoria-history-gap-red.log`, `/private/tmp/euphoria-new-conversation-red.log`

No production identity, streaming, cloud restoration, webhooks/APNs, scheduled workflows, hosted computer executor, third-party OAuth/integration, full A2UI/basicCatalog or complete OpenDuet parity has been verified. See `SPIKE_HANDOFF.md` for the next implementation step.

## Latest A2UI adapter evidence

- Source fixture derives from OpenDuet's own A2UI test. Normalization/defaults/edited-data event output, literal context, UTF-16 limits, unsupported version/catalog/attributes/trees/paths, schema advertisement and committed native projection consistency are covered.
- HTTP tests exercise foreign owner rejection, stale revision rejection, source-context output with ISO timestamp and duplicate submission after gateway reopen executing only once. Unsupported source input publishes no controls and sends no tool result.
- Native tests verify Paris defaults, Kyoto edit, empty/whitespace preservation, revision isolation, queued submission locking and on-disk SwiftData reopen retaining event bindings.
- Fresh Terra/medium review found a UTF-16/grapheme input mismatch and omitted timestamp. Actual RED regressions preceded the fix; complete gateway/core/native suites passed afterward. A fixture consistency assertion was corrected from JavaScript prototype equality to JSON-wire equality. An initial malformed-metadata test used a forced unwrap; it was corrected to XCTUnwrap.
- Current logs: `/private/tmp/euphoria-a2ui-verified-node.log`, `euphoria-a2ui-verified-core.log`, `euphoria-a2ui-verified-native.log`; native xcresult `/private/tmp/euphoria-a2ui-verified/Debug-tests-20261028T103132-30148.xcresult`. Native script exited0,17 executed/passed,0 failed/skipped.
- Prior evidence sections describe the previous broader gallery/conversation milestone; their old artifact paths remain valid. Expanded manual native A2UI interaction, real provider use and full catalog parity remain unverified.
