# Euphoria iOS: native M0/M1 foundation

This folder contains a **native SwiftUI** iOS application target named `Euphoria`. It does not import React Native, Expo, WebKit or an agent SDK, and it does not alter OpenBot. The web app under `openbot/app/` remains the behavioral reference.

## Implemented today

- An ordinary SwiftUI `NavigationStack`/system `Form` with a developer-facing deployment diagnostic.
- HTTPS-only OpenBot origin validation, with loopback HTTP allowed in Debug only.
- A real public `GET /api/capabilities` request against the person's existing server and typed decoding of the server's capability flags.
- Cancellation when navigating away or editing the origin.
- XCTest cases for origin validation and capability decoding.

**Not implemented:** native Better Auth sign-in/session transfer, AG-UI /info and stream, frontend tool registration, approvals, live channel events, history, and any production feature screen. No mock conversations or server tool behavior is present. This project is a build-oriented foundation, **not** an M1 integration proof. No tests have been executed against a live OpenBot server.

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
