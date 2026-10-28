# Managed native checkpoint — 29 October 2026

## Read this first

User requested this checkpoint because account usage limits are nearly exhausted. Stop feature work and resume from this branch with another agent. Phase one is **not complete**. Do not describe the local development assembly, native fixtures, or a single live journey as full OpenDuet parity.

Branch: `codex/managed-native-execution`, based on integration commit `bb855c9`. Main and the upstream integration branch were not merged or rewritten. The user authorized pushing this working branch. Read `AGENTS.md`, `docs/DECISIONS.md`, this handoff and `docs/NOW.md` before modifying anything.

## Accepted direction and preferences

- Phase one: original OpenDuet functionality and recognizable visuals, native SwiftUI shell/ordinary controls, managed OpenAI Agents API replacing CopilotKit Intelligence. Only generated artifacts may use isolated web views. Phase two applies ETERNAL's visual experience.
- Reuse original source services, stores, queue, Bot identity, permissions and product behavior; do not build another agent harness, task engine or parallel domain store. Preserve existing feature/archive branches.
- Use Superpowers end to end. Approved focused continuation does not require another design-approval question. User prefers GPT-6.1 Terra/medium if a reviewer/subagent is needed.
- User requests must sound natural. Schema examples, output contracts and repairs belong in tool/system instructions and adapter logic, not user prompts. One schema-heavy message in the synthetic live conversation was a diagnostic; do not copy that into the product flow.
- API credits are scarce. No speculative paid comparisons. The user explicitly allowed **one minimal uncapped live journey** after the deployed API rejected its documented session budget. That test is now over; **do not treat it as permission for further uncapped tests**.

## What changed

### Original-source development backend

`openbot/server/src/agents/managed-development.ts` assembles original Hono route factories, AgentProfileStore, runtime registrations, ChannelStore, DeliveryStore/Router, WorkQueue and existing managed source receipts. It binds only `127.0.0.1:8788`; production mode is refused. Original tenant package seeds the OpenDuet Bot.

Mounted: source authentication probe, Bots, channels, conversation roster/history/submission and native visual/action routes. It uses a loopback-only development cookie/token, not anonymous admin or production authentication. Key stays server-side.

Only the native presentation function is supplied. No external-effect tools, MCP, computers, integrations, background automation, push or plugin authority are granted by this assembly. Other source-backed tabs exist but their routes are **not all mounted here**. Original `server/src/index.ts` still requires the CopilotKit Intelligence runner; this is a separate explicit development entrypoint, **not a production cutover**.

- Existing `gateway/agents-client.mjs` remains the provider transport; no second SDK/runtime was introduced.
- Exact initial session/root events bind original Inbox receipts. Development follow-ups use the same hosted session, list prior turns, subscribe before POST and bind an actual new root event. This assumes the loopback source worker is the sole input writer; it is not a general multiwriter correlator.
- Native responses persist in the original WorkQueue before provider submission. Conflicting concurrent decisions compare the persisted winner. Unknown/reclaimed writes are retained with a visible error and are not automatically replayed or falsely finished.
- Invalid render arguments can receive **at most one durable correction per root** via the existing rejection method and original queue. Repeated invalid output is left explicit rather than looping paid retries. Tested offline; the first live invalid call had already ended before this correction path was installed, so its live recovery is not proven.
- Completed messages/artifacts are projected onto the **existing original Inbox/root receipt**, not a new transcript database. Migration `0070_managed_completed_projection.sql` adds `completed_output`. History and completed visuals reopen from that projection without rereading the provider. All completed surfaces retain conversation positions; stale previous visuals no longer settle a new request.
- Definitive HTTP rejections preserve status and settle as failed. Native reads expose original delivery state/error, eliminating the observed indefinite Working state.

### Prompts/settings/caching

`gateway/render-prompt.mjs` is the versioned stable instruction prefix (`native-render-v3`), used by the gateway and source assembly. It separates task, presentation, completion evidence and wire contracts; explicitly states the exact catalog URL, A2UI version and connected/initialized graph requirements. Original supported wire constraints remain; no capability was silently dropped.

Luna testing uses explicit low reasoning and low verbosity, no higher-model fallback. Existing managed session owns history/context. No unsupported Responses cache keys, TTLs or cache breakpoints were added to Agents session requests.

Default transport keeps its original bounded budget. Explicit `allowUncappedSession:true` plus a null limit omits it only when requested. The development entrypoint's `EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY=1` additionally refuses another new session after one source-linked session exists. **Do not set that flag during ordinary restart.** It was not saved into the user's env file.

### Native app

Fixed actual incoming build errors across Source views: malformed guard closure/keypath syntax, caught-error shadowing and a SwiftUI collection/style inference issue. Updated stale mock fixtures that returned JSON where the transport correctly requested SSE, plus source ownership/reconciliation expectations.

Source Chat now translates source `styles.css`, `motion.ts`, `chat-transcript.tsx` and `mic-orb-draw.ts`: neutral light/dark surfaces, violet user bubbles, 20pt bubble/card radii, fixed bottom composer, compact header, 200ms source entrance curve, Ocean orb mesh/eye projection/microphone pads. Standard controls remain SwiftUI. Uses existing VisualNodesView, VisualState and SwiftData snapshots; no second renderer/store.

Working, waiting for a choice, rejection and uncertainty are distinct. Completed choices show the saved selected label instead of a faded button forest. Form edits/pending actions save locally before sending. Completed artifacts restore in their original message position.

**Not a full faithful visual port yet:** other tabs remain native lists; roster/home differs from source's ongoing Chat-first experience. Orb spring tracks, landing/check/rays, full source visual/tool repertoire and finer source interaction details remain. Do not advertise pixel parity or finished UX.

## Executed evidence

All commands ran on this Mac. Evidence under `/private/tmp` is local only and may disappear; it is not committed or portable.

- Gateway Node suite: **177 passed, 0 failed** (`/private/tmp/euphoria-final-gateway-all.log`). Includes supported reasoning/verbosity, explicit uncapped opt-in and safe rejection behavior. New prompt-v3 wording was added afterward; no runtime protocol change there.
- Source TypeScript: **pass** (`/private/tmp/euphoria-repair-types.log`).
- Original source boundary suites: **33 passed, 0 failed, 127 assertions** across definition, receipts, reconciliation, delivery router and connection handling (`/private/tmp/euphoria-final-source-all.log`).
- PostgreSQL-backed development tests on a fresh disposable DB: **5 passed, 0 failed, 41 assertions** (`/private/tmp/euphoria-repair-db.log`). Includes duplicate prevention, unknown responses, HTTP rejection, exact-root output, provider-offline restoration and one bounded render correction.
- SwiftPM core: **76 passed, 0 failed** (`/private/tmp/euphoria-final-core.log`).
- Latest native verification: Debug and Release builds, built ATS checks and **39/39 iOS XCTest, zero failed/skipped** (`/private/tmp/euphoria-native-verified-last.log`; `/private/tmp/euphoria-managed-native-build/Debug-tests-summary.json`).
- Independent Terra/medium reviewer identified follow-up correlation, action race, false finish, raw provider history and lost completed visuals. These were addressed and regression-tested. The latest completed-output projection/Chat polish has **not** had a final fresh independent re-review; run that before a production integration.
- Some earlier DB tests failed because previous failed fixtures left work in the shared DEV_ACTOR queue. Fresh isolated disposable DBs pass. Do not point these injected-provider tests at real/live development work; use a fresh test database per run.

## Live evidence — what actually happened

1. A real native message reached original DeliveryStore/WorkQueue. The API rejected session creation with HTTP400 `unknown_parameter`, parameter `spend_control`. Official current docs list the field, but this key's deployed API rejected it. Read-only session inspection also lacked that field. No new session was created by that rejected request. The original failed row remains saved; no automatic resubmission.
2. With the user's explicit one-journey uncapped approval, **one** source-linked Luna session was created. Initial natural request produced an invalid A2UI graph (missing required version/catalog/tree details); the native validator rejected it. The model later ended with a plain-text question. This is failure evidence, not successful UI generation.
3. A schema-heavy same-session diagnostic produced a valid native choice, but the pending call ended before the tap was accepted. No response job was created for that attempt. Do not claim it worked.
4. A further **natural-language** message in that same session — “Let me pick between Pull day and Leg day, then suggest three exercises for the day I choose.” — produced a real native choice. A native tap recorded **Leg day**, one original queue job submitted it, and Luna answered “You chose Leg day: squats, Romanian deadlifts, and walking lunges.” The canonical saved action and tool output both say `legs`/`Leg day`, and the reply matches.
5. Source Inbox settled `sent`; completed source projection contains the answer and native choice. Native screen displayed both. Latest selected-label polish was built/tested after that screenshot; relaunch verification of that exact final polish remains to do.

The automation targeted a Pull-labelled snapshot ref, but the actual saved native action was Leg day after layout movement. Treat the **saved action and result** as evidence, not the stale automation label. Verify touch targets with settled screenshots before claiming precise target testing.

The successful natural request was submitted through the original HTTP source API to make the bounded test prompt reliably reproducible; the choice was tapped in the native Simulator. Initial native composer submission itself was exercised by the earlier rejected request. Do not call this a completely native successful typing-to-relaunch usability test.

Read-only usage from the three completed roots in that single session:

| root/order | input | cached input | output | reasoning | wall time |
|---|---:|---:|---:|---:|---:|
| initial invalid UI | 84,286 | 73,401 | 511 | 112 | 230s |
| schema diagnostic | 33,301 | 22,107 | 155 | 12 | 66s |
| natural request + native choice | 22,583 | 22,411 | 128 | 21 | 28s |

These are provider token/turn measurements, **not dollar billing**. Wall time includes waiting for a person/tools, not pure model latency. No separate cache-write count or billed savings was supplied. The first two roots are overhead/failure evidence and must be included in cost assessment.

## Host/local configuration

- Actual repo `/Users/mohithgowda/EUPHORIA`; task's default cwd may still be ETERNAL. Always set workdir explicitly.
- Bun 1.4.4 installed only under `/private/tmp/euphoria-tools/node_modules/.bin/bun`. Original pinned source dependencies installed with frozen lockfile. No lockfile changes intended.
- Colima started (2 CPU/4GB); Docker context changed to colima. Disposable container `euphoria-development-postgres`, image `pgvector/pgvector:pg17`, host bind `127.0.0.1:55432` to5432, local-only user/password `euphoria` / `euphoria-local-only`.
- `euphoria_live`: actual source development DB; preserves the rejected request and one synthetic live journey. `euphoria` and `euphoria_validation_*`: disposable injected-provider test DBs. Migrations through0070 applied. Do not delete live data to make tests green.
- Existing ignored `gateway/.env` holds the user's API key/model/local token. Never print, commit or transmit it. No key was embedded in iOS.
- Development auth cookie `euphoria-development=<EUPHORIA_DEV_TOKEN>`. DEBUG native process env uses `EUPHORIA_SOURCE_ORIGIN=http://127.0.0.1:8788` and `EUPHORIA_SOURCE_TOKEN` with that local token. Only loopback allowed. Release ignores this bypass.
- Simulator: iPhone18ProMax/iOS27, UDID `5B3B22FA-F6A4-498A-8BD5-11AA6F248EBB`; bundle `dev.euphoria.ios`. Project `ios/Euphoria.xcodeproj`, scheme `Euphoria`.
- **Uncapped backend process stopped at checkpoint.** Postgres/Colima remain running. No new paid calls should occur just from the checkpoint being left open.

Normal development restart (server-side key loaded without printing it):

```sh
DATABASE_URL=postgres://euphoria:euphoria-local-only@127.0.0.1:55432/euphoria_live \
  bun --env-file=gateway/.env openbot/server/src/agents/managed-development.ts
```

This retains the budget by default and therefore this deployed API may reject **new** session creation until compatibility is resolved. Existing session reads/restoration remain useful. Do not silently enable uncapped mode to bypass that issue.

## Remaining work / ordered next steps

1. **Close the interaction-lifecycle gap before more UI breadth.** Live unanswered tool calls ended without a selection; durable long human waits are not proven. Determine the provider's actual lifecycle and reuse original source `ask_person`/questions/reply-chip behavior where appropriate. Do not fake a choice, auto-select, or keep an indefinite Working state. Avoid building another task/approval engine. One successful fast tap does not prove pause/recovery after hours or server restart.
2. Relaunch final native build and verify selected answer/result restoration and no inference on reopen; test correction, form drafts, uncertain response and different Bot/channel identity. Test actual human input/touch stability, not just fixture controls.
3. Fresh independent review of latest projection and final native changes. Inspect SQL JSONB storage shape: the new completed-output field was displayed as a JSON string by psql, although Drizzle reads/tests and native restoration deserialize correctly. Align with original source JSONB serialization before relying on SQL JSON-path operations or migrating production data.
4. Resolve documented-versus-deployed `spend_control` mismatch with current official API/account capability evidence; keep uncapped mode explicit, opt-in, and separately authorized. No model fallback or silently removed budgets.
5. Improve prompt/tool contract reliability with natural task evals. The large multi-format render schema/prefix is expensive and invites graph errors. Evaluate narrow supported tool definitions/examples per capability while preserving expressive composition; avoid placing schema JSON in user requests. Compare quality, retries, cached tokens and model-only latency before optimizing cost claims.
6. Finish faithful source UI/UX across ongoing Chat home, Tasks boards/statuses, Bots, approvals, Make/artifacts, routines, connections and source animations. Existing source fidelity ledger documents unfinished coverage. Preserve native shell and isolated artifact boundary; do not restyle generically or confuse Chat polish with all-screen parity.
7. Mount/reuse original Tasks, memory, approvals, plugin/permission, routines and gallery services in the managed backend. Implement approved tool/credential mappings rather than letting presentation imply authority. Current loopback assembly is deliberately incomplete.
8. Production integration: original index.ts execution seam, real Better Auth identity/HTTPS hosting, durable recovery/webhooks, APNs/background, hosted compute/MCP/plugin/tool permissions and credential revocation, full source capability parity. The one local journey is not certification for any of these.

No PR/main merge requested. Preserve this branch and its negative evidence. The next agent should start with final re-review and native reopen proof, then address durable human interaction using the source's existing mechanisms.
