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

- **2026-10-28 Phase 1 product fidelity:** reproduce OpenDuet **as-is on iPhone**: original mobile screens, navigation, tasks/questions/reports, ongoing conversations, GenUI, galleries, Make, Bots, memory, skills, connections, approvals, permissions and recovery. Replace CopilotKit Intelligence with OpenAI Agents API; use the original mobile source behavior as the acceptance reference, not a redesigned or simplified ETERNAL-inspired interface. Keep controlled native UI, standard A2UI and isolated open GenUI distinct. Agent A owns real backend equivalents; Agent B owns faithful SwiftUI presentation. Phase 2 alone introduces ETERNAL design. Score parity only from exact actions, failures, durable restoration and verified server effects. Ledger: `docs/phase1-ui/OPENDUET_SOURCE_FIDELITY_LEDGER.md`.
