# Accepted decisions

These record explicit user choices from the project conversation, not proposed architecture.

- **Phase one:** OpenDuet is the functional specification; recreate its capabilities in iOS using a native SwiftUI shell and OpenAI Agents API for intelligence. Existing local behavior is a starting point, not completed parity.
- **Phase two:** apply ETERNAL's visual interface after the phase-one functional foundation works.
- **Generated artifacts, 2026-10-28:** allow isolated web artifacts; keep the app shell native SwiftUI. This supersedes the earlier all-native-content restriction only for generated artifacts.
- **Personal data:** keep personal records on-device by default. Authentication, app data and integration credentials still need working boundaries; Sign in with Apple was suggested for exploration, not selected as an implemented auth solution.
- **Execution:** continue phase one without waiting for an API key; verify the actual provider when one is available. No fake inference fallback.
- **Source control, 2026-10-28:** push implementation and context to the EUPHORIA repository, then continue the next work. This authorizes feature-branch pushes, not an implicit main merge.

- **Live testing, 2026-10-28:** user selected GPT-6 Luna (`gpt-6-luna`) and requested a local environment file for entering the server-side API key. Do not put the key in app code or Git.

- **API usage,2026-10-28:** user requires using the paid key only when absolutely necessary; default implementation, validation and regression work to offline fixtures.
- **Integration,2026-10-28:** finish the current workflow batch, then validate and integrate the newer A2UI branch into the working feature branch. No implicit main merge.

- **Managed-first source reuse, 2026-10-28:** one lead engineering agent. Phase 1 reproduces OpenDuet as-is on native SwiftUI, replacing CopilotKit Intelligence with OpenAI Agents API. Preferred implementation order: managed Agents API capability where equivalent, original OpenDuet/OpenBot service for product-specific functionality, a minimal adapter only for real mismatch. Compare managed Automations, MCP/plugins/vaults, skills, computer, sandbox/files, sessions, streaming, recovery and subagents before preserving redundant infrastructure. Keep both previous branches as recovery points, no main merge or premature code retirement. Test one genuine Chat → Task → A2UI → report → relaunch journey before declaring parity. ETERNAL redesign is Phase 2.
