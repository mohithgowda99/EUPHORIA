# Current verification evidence — 2026-10-28

Base9e62bfd, branch `feature/agents-native-visual-contract-spike`, plus this native gateway-loop milestone. Main and OpenBot untouched. No API key or live OpenAI request.

| Layer | Executed | Result | Limit |
|---|---|---|---|
| Gateway | `node --test gateway/tests/*.test.mjs` |28 passed, zero failed | Local HTTP/provider fixtures only |
| Portable Swift | `swift test --package-path ios/VisualRuntimeCore --scratch-path /private/tmp/euphoria-core-build --disable-sandbox` (module caches under/private/tmp) |19 XCTest passed, zero failed | Core decoder/state/client contracts on macOS |
| Native builds | `EUPHORIA_BUILD_LOG_DIR=/private/tmp/euphoria-loop-final EUPHORIA_SIMULATOR_ID=<installed iOS27 UDID> bash ios/scripts/verify-xcode.sh` |Debug/Release, built-plist checks passed | No signing/physical-device qualification |
| Native XCTest | Same script |12 passed, zero failed/skipped, xcresult Passed |6 endpoint tests,3 persistence tests,3 new session/recovery tests |
| Native HTTP loop | Explicit local QA provider + iPhone18ProMax iOS27 Simulator |Request → Training choice → form → decline approval → idle; all3 provider result assertions passed exactly once |No inference or external action; manual Refresh |
| Re-entry | Terminate/relaunch during unsent form |Typed value `P` restored, then successfully submitted and continued |Actual native app + SwiftData + HTTP, not only Codable |

Core RED→GREEN cases: invalid decoded surfaces; immutable revision; checkbox overlay removal while retaining later edits; resolved decision locking/legacy migration; rejected intent unlock. Native URLSession tests cover canonical bearer/payload, secure connection, invalid incoming surface, sanitized errors and preserved creation ID. The three session-model tests prove clean session switching, uncertain creation not masked by an old session, and explicit cancelled-creation recovery.

Fresh Terra/medium review found stranded operations and inactive provider-call controls. Gateway cancellation records prevent late delivery from replaying cancelled intents; unknown submitted effects stay blocked. All important findings were covered with regressions and the complete suites passed. Deferred minor: approval-note draft is transient view state and lacks form-style re-entry continuity.

Verification correction: first selected run of the new native test class reported0 executed because target registration was missing. That result was not credited. Registration fixed;2 actual RED failures observed; after fixes and an additional recovery case,3 selected cases and the full12-case run passed.

Automation notes: build_run_sim did not apply session-default environment; explicit launch_app_sim environment did. Text injection near the keyboard did not enter the form draft; tapping the native P key produced a visible value, which was checked after re-entry. Some action snapshots timed out; subsequent explicit snapshots supplied assertions. No app fix was inferred from these automation issues.

Local artifacts, not committed:
- `/private/tmp/euphoria-loop-node-final.log`, `/private/tmp/euphoria-loop-core-final.log`
- `/private/tmp/euphoria-loop-final-native.log`
- `/private/tmp/euphoria-loop-final/Debug-tests-20261028T085416-19535.xcresult`
- `/private/tmp/euphoria-session-model-red.log`, `/private/tmp/euphoria-session-model-green.log`, `/private/tmp/euphoria-loop-review-red.log`
- `/private/tmp/euphoria-native-fixture.log`
- `/var/folders/bg/htlsh3x15877_qwg9cr4nmz00000gn/T/screenshot_optimized_6de2dfe6-e874-4c96-8673-0d4faef50641.jpg` (idle, explicit fixture banner)

**Unimplemented/unverified:** live Agents API access/model compatibility, production sign-in and deployment, unattended phone-independent runtime, native production account setup, stream/history UI, remaining OpenDuet source parity, webhooks/integrations/routines, automatic authoritative resolution of genuinely uncertain writes, and human visual-quality acceptance. Local proof is not full phase one.

**Next:** extend native conversation/history and source-component parity through this same authenticated boundary; configure the real provider server and execute the live acceptance sequence once credentials are available. Do not conflate manual snapshot refresh with streaming or remote acceptance with completed actions.

Final native check: after the resolved-section fix and relaunch, accepted approval buttons and the note field are no longer typing/tap targets. Only request composer and Refresh remain active. The local QA server was stopped after verification.
