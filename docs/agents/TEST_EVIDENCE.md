# Evidence (2026-10-27)

- Executor: Linux x86_64, Swift 6.2.1. No Xcode/iOS 27 SDK or configured live Agents API service.
- Command: `cd ios/VisualRuntimeCore && swift test --jobs 2`
- Output: `Test Suite 'All tests' passed ... Executed 8 tests, with 0 failures (0 unexpected)`.
- Scope: schema validation; choice payload; form required/numeric; approval pending; showChecklist read-only vs pageChecklist editing; Codable restoration; authoritative ack and stale revision; unknown types/version refusal.
- **NOT RUN:** macOS `xcodebuild`, SwiftUI host smoke, SwiftData in-app relaunch test, gateway/API, agent-generated UI, real tool resume, webhook, automation or cross-user authorization.
- Reviewer should extract `.xcresult` counts for **new** branch and separately validate the latest Xcode test count; the installer adjusts the old 6-test result assertion to 7, which still needs execution on Mac.
- Additional non-Swift check: `jsonschema.Draft202012Validator.check_schema` + `jsonschema.validate` against five reference nodes. PASS; intentionally rejects schemaVersion 2 and unknown `executeJavaScript` kind. This does **not** validate model tool-call integration or cover every A2UI component.
