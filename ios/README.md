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
