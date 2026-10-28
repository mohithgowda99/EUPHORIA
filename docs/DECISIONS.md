# Accepted decisions

These record explicit user choices from the project conversation, not proposed architecture.

- **Phase one:** OpenDuet is the functional specification; recreate its capabilities in iOS using a native SwiftUI shell and OpenAI Agents API for intelligence. Existing local behavior is a starting point, not completed parity.
- **Phase two:** apply ETERNAL's visual interface after the phase-one functional foundation works.
- **Generated artifacts, 2026-10-28:** allow isolated web artifacts; keep the app shell native SwiftUI. This supersedes the earlier all-native-content restriction only for generated artifacts.
- **Personal data:** keep personal records on-device by default. Authentication, app data and integration credentials still need working boundaries; Sign in with Apple was suggested for exploration, not selected as an implemented auth solution.
- **Execution:** continue phase one without waiting for an API key; verify the actual provider when one is available. No fake inference fallback.
- **Source control, 2026-10-28:** push implementation and context to the EUPHORIA repository, then continue the next work. This authorizes feature-branch pushes, not an implicit main merge.
