# Current native workflow checkpoint

Implementation1fcb1e7 opens a Tasks browser over existing gateway sessions. Search loaded pages, load more, open exact work, New and Resume share the existing detail/model/SwiftData archives. Development fixtures are behind Development tools. Native gate now requires24 XCTest, plus Debug/Release/plist; gateway84/core51. No paid calls/key use in this batch. Full task lifecycle, production accounts and retained actual-provider uncertainty remain open. Current evidence is in docs/NOW.md and docs/agents/TEST_EVIDENCE.md; older milestone notes below are historical.

# Current Agents API native validation

On `feature/agents-native-visual-contract-spike`, implementation `5e5d6e0` adds foreground live canonical snapshots/reconnection to the Debug gateway session proof. `ios/scripts/verify-xcode.sh` now requires **20 XCTest passes**, Debug/Release builds and built-plist checks. Core suite:49; gateway suite:77. Bounded real Luna choice/continuation and relaunch are verified. A fully native-created request hit uncertain error delivery, so full acceptance remains open. Native local QA confirms automatic choice-to-form plus relaunch restoration; keyboard automation did not establish a full form flow. The sections below describe earlier archived milestones; use `docs/NOW.md` and `docs/agents/TEST_EVIDENCE.md` for current status.

# Euphoria native iOS

Native SwiftUI application target `Euphoria`, iOS27. Standard controls remain native; generated artifacts alone use isolated WebKit. OpenDuet under `openbot/app/` is the behavioral reference.

## Current implementation

Shared native decisions/forms/checklists and typed gallery; revision-scoped persisted notes and source-form drafts; owner-scoped gateway sessions/messages/history/cancel; isolated offline HTML/JavaScript artifacts. The source A2UI adapter reproduces text, boolean and single/multiple selection binding/actions through the existing native form and journal. Native Toggle and labelled selection controls retain actual boolean/array values and survive reopening. It is not a general A2UI renderer.

Debug entries include gateway connection proof, source-derived controls, gallery/artifact fixtures and an A2UI form fixture. Fixture controls queue local intentions; they perform no inference or real external action. Gateway launch setup is in [gateway/README](../gateway/README.md).

Current verification and remaining scope: [NOW](../docs/NOW.md), [evidence](../docs/agents/TEST_EVIDENCE.md), [full parity ledger](../docs/ios/FEATURE_PARITY.md). Production login/deployment, full A2UI/catalog/page/workflow/integration/computer parity and live OpenAI execution remain pending.

## Build on the MacBook Air

Open `ios/Euphoria.xcodeproj` in Xcode with the iOS 27 SDK installed, or:

```sh
xcodebuild -list -project ios/Euphoria.xcodeproj
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Euphoria.xcodeproj -scheme Euphoria -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Select an installed simulator to run the `EuphoriaTests` unit-test target. Debug loopback connects to the **simulator's** localhost, not an arbitrary physical device on the LAN. Use an HTTPS deployment for hardware.

No `.env`, API keys, user credentials, or model secrets belong in this target.

## Architecture freeze until reviewer decision

Read `docs/ios/M0_ARCHITECTURE.md`, `docs/ios/FEATURE_PARITY.md` and `docs/ios/M1_PROOF_PLAN.md`. Before adding authenticated chat, validate the existing server's Better Auth mobile flow and choose a tested Swift AG-UI SDK. Do not introduce custom transport or duplicate server authority without proving necessity.

## M1-A validation and known limits

Run `bash ios/scripts/verify-xcode.sh` from the repository root on a Mac with Xcode and the iOS 27 simulator SDK. To run XCTest, first select an installed simulator UDID with `xcrun simctl list devices available` and set `EUPHORIA_SIMULATOR_ID` before invoking the script. The script runs both configurations and the existing `EuphoriaTests` suite; it does not auto-start Docker or log credentials.

A Debug-specific Info.plist declares `NSAllowsLocalNetworking=YES` for loopback iOS simulator testing; the Release target retains the Xcode-generated Info.plist without an ATS exemption. The app's `OpenBotEndpoint` independently restricts plaintext HTTP to exact loopback hosts and only in Debug. Actual ATS behavior must still be verified on iOS 27; static plist syntax is not runtime proof.

Current run environment (Linux Swift 6.2.1, 2026-10-27): `xcodebuild`, `docker`, `bun` unavailable and GitHub shell network blocked. Portable copy of `OpenBotEndpoint.swift` passed strict Swift 6 type-check/compile and seven behavior assertions in both Debug/Release conditions, but **native Xcode builds and XCTest remain NOT RUN**. See `docs/ios/M1A_EXECUTION_REPORT.md`.

## Reviewer revalidation (M1-A)

After pulling the corrected branch, rerun `EUPHORIA_SIMULATOR_ID=<installed-iOS-27-UDID> bash ios/scripts/verify-xcode.sh`. This now stores unique `.xcresult` bundles inside ignored `ios/.build-logs/`, queries the Xcode result summary, fails if there are not exactly six passed XCTest cases and zero failures/skips, and checks that only the built Debug app has `NSAllowsLocalNetworking`. A successful build/plist assertion is **not** the separately required live simulator ATS smoke test with `http://localhost:3001` and `http://127.0.0.1:3001` running on the real local OpenBot service. See `docs/ios/M1_PROOF_PLAN.md` for the two-user runtime authorization and entitlement-readiness fixtures.

For local server preflight after `bash scripts/start.sh`, run `python3 ios/scripts/inspect-openbot-fixture.py http://127.0.0.1:3001`. This makes only four unauthenticated, read-only GETs and prints sanitized status/entitlement data. Its results do not substitute for native OAuth, per-thread authorization, iOS ATS or an agent run.

## Agents API native visual runtime prototype

The separate `feature/agents-native-visual-contract-spike` branch integrates the source-derived SwiftUI renderer, SwiftData snapshots, five component contract families, and `VisualRuntimeCore` Swift package. This is a local interaction fixture, not a live OpenAI Agents API connection. In Debug, open **Visual contract proof → Open source-derived UI fixtures**. It supports choice, form, approval intent, read-only gallery checklist and editable page checklist; local changes survive app relaunch through SwiftData. It does not execute external effects or submit tool results.

On the Mac, from the repository root, run `cd ios/VisualRuntimeCore && swift test`, then run `EUPHORIA_SIMULATOR_ID=<iOS-27-simulator-UDID> bash ios/scripts/verify-xcode.sh`. The Xcode script now asserts **8 tests** (the original six plus two SwiftData persistence tests). Confirm those counts in the generated `.xcresult` before declaring iOS verification. For full contract inventory, consult `docs/agents/NATIVE_VISUAL_PARITY.md`. No API key belongs in the app.
