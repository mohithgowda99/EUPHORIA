# Current verification evidence — 2026-10-28

Baseline: `de9d990d170c47c0b02086a016d3a6d61eb4130e`, branch `feature/agents-native-visual-contract-spike`, plus the provider-boundary/persistence change recorded with this document. No edits to OpenBot/CopilotKit or main.

| Layer | Executed check | Result | Limit |
|---|---|---|---|
| Portable native contract | `swift test --package-path ios/VisualRuntimeCore --scratch-path /private/tmp/euphoria-core-build --disable-sandbox` (module caches in /private/tmp) | 8 XCTest passed, zero failures | Deterministic contract logic only |
| Native builds | `EUPHORIA_BUILD_LOG_DIR=/private/tmp/euphoria-verification EUPHORIA_SIMULATOR_ID=<installed iOS27 UDID> bash ios/scripts/verify-xcode.sh` | Debug and Release passed; built-plist Debug local ATS key true, Release absent | No physical-device signing or runtime networking proof |
| Native persistence | Same script, iOS27 iPhone18ProMax Simulator | 9 XCTest passed, zero failed/skipped; xcresult status Passed | Includes new disk-backed fresh-container reopen; existing 2 memory tests +6 endpoint tests retained |
| Native interaction | Launch, open fixtures, choose Staging; explicitly focus Team name and enter `Local restoration check`; terminate, launch, reopen fixtures | Team name restored; one unsynchronized action retained; choice controls remain disabled | Local fixture only; no gateway acknowledgement or external action |
| Provider transport | `node --test gateway/tests/*.test.mjs` on Node26.4.0 | 12 passed, zero failures | Real HTTP to a local provider stub, NOT OpenAI |
| Review fixes | Added regression tests for empty HTTP202 acceptance and rejected error-body cleanup | Both observed RED, then full12 GREEN after fixes | Fresh Terra/medium review; no live provider access |

Local artifacts (not committed): `/private/tmp/euphoria-core-current.log`, `/private/tmp/euphoria-gateway-green.log`, `/private/tmp/euphoria-gateway-review-red.log`, `/private/tmp/euphoria-native-verification.log`, `/private/tmp/euphoria-verification/Debug-tests-20261028T013146-12505.xcresult`. Final relaunch screenshot: `/var/folders/bg/htlsh3x15877_qwg9cr4nmz00000gn/T/screenshot_optimized_1711468a-89e9-476f-9ca3-ee870dc893a8.jpg`.

Automation note: initial text injection did not focus the field; a native touch focused it and subsequent typing, snapshot and relaunch proved the stored draft. Some action snapshots timed out; explicit subsequent snapshots supplied the assertions. No app source change was inferred from the automation issue.

**Unimplemented/unverified:** public authenticated gateway, Sign in with Apple verification, server ownership/grants/durable action journal, API-to-native connection, model-generated visual payload, stream forwarding/recovery, live Agents API session/tool continuation, cloud restoration, integrations, webhooks, automations, physical-phone execution, complete OpenDuet parity. No API key is configured. Key availability gates live verification, not continued implementation. HTTP202 means accepted, never completed.

**Single next step:** implement the authenticated gateway's owner/session and validated visual-action round trip, connect it to the existing native renderer, and then run the live acceptance sequence when credentials are available. Keep synthetic protocol checks separate from live evidence.
