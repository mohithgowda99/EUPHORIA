# EUPHORIA — live implementation checkpoint (2026-10-28)

**Active branch:** `feature/phase1-reuse-first-integration`. Preserve the prior backend, native UI, A2UI parity and iOS branches as recovery points. **Main unchanged.**

**Product objective:** native SwiftUI port of original OpenDuet with OpenAI Agents API replacing CopilotKit Intelligence. Managed Agents runtime first, original OpenDuet services for product identity/authorization/state, minimal adapters only. Phase 2 ETERNAL visual redesign is excluded.

## Implemented since `2d423f8`

- **Native home changed from mislabeled provider-session Tasks to Chat.** Existing `GatewaySessionModel` restores provider sessions, streams snapshots, shows conversation history and native A2UI/GenUI responses, sends/cancels via the saved operation journal. Genuine Tasks are now a separate native tab.
- **Genuine task records and actions:** native `/v1/tasks` lifecycle sections, read/detail/report, creation POST and server-authorized resolve/reopen. Task detail opens the exact underlying provider session for reply, cancellation and generated-interface actions through the existing `GatewaySessionModel`, not a duplicate executor. Real OpenDuet Bot identities, task sources, Up Next, source task retry and original TaskStore remain pending.
- **Restart-safe creation:** `TaskCreationSnapshot` saves the exact payload plus request identity *before* POST; retries are explicit and use the same ID. Pending uncertain delivery never silently creates a new task. Local Chat and each task conversation use separate archives, retaining the original Chat archive key for existing data.
- **Managed cost control:** Agents API create-session now passes official `spend_control.limit` (USD cents), default 50 cents/session on development gateway, configurable by `EUPHORIA_SESSION_SPEND_LIMIT_CENTS` from 1–500. Provider best-effort spend limit is not an overall account ceiling. No paid calls made.
- **Original OpenDuet task status:** original `taskStatus` function is imported by transitional gateway task service and re-exported to original TaskStore, instead of two separate rules. The separate Agent B A2UI Swift spike remains nonshipping and unchanged.

## Validation evidence and outstanding gates

- **Executed here:** isolated Linux Swift label checks (2 assertions); isolated Node source-status priority checks (5 cases); nine remote structural contract checks against committed iOS project registration, task API routes, identity and state boundaries.
- **Added but not executed here:** Swift transport route/idempotency tests, SwiftData archive isolation/intent restoration tests, managed spend-control provider-HTTP test. Existing original OpenBot, gateway and Swift package suites are not re-run on this head.
- **Not available in this runtime:** full Git checkout / Mac worktrees, Bun 1.4 / Node 24, Xcode, macOS/iOS Simulator, code signing, user device and running authenticated production backend. Remote GitHub contents were inspected and committed through connector; no local Mac files or uncommitted work were overwritten.
- **NOT accepted:** real-provider end-to-end journey, Bot management/connections, original source TaskStore runtime integration, production sign-in, remote deployment, APNs, managed automations equivalence, complete native A2UI conformance and 79-route OpenDuet product parity.

**Next functional gate:** run baseline on a Mac checkout, fix build errors, then wire original OpenDuet Bot/Channel/TaskStore services to managed Agents execution and replace transitional gateway task ownership only after authenticated source parity + restoration tests. Bind original Chat/Bots/Tasks screens, verify live provider A2UI continuation, deploy source backend and test device relaunch outside local network.

Architecture detail: `docs/architecture/MANAGED_FIRST_REUSE_AUDIT.md`; route ledger: `docs/phase1-ui/OPENDUET_SOURCE_FIDELITY_LEDGER.md`.
