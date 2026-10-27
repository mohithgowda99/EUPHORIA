# Phase-one Agents boundary implementation plan

> Execute inline with Superpowers executing-plans. User authorized continued phase one without an API key.

**Goal:** Implement and locally verify the provider-facing session/tool protocol; prove native disk restoration. This milestone does not complete OpenDuet parity.

**Architecture:** Keep SwiftUI and SwiftData as the current native surface and local records. Add a dependency-free Node provider adapter for the future authenticated gateway, without a public server or duplicate product store. Credentials exist only in its server process. Apple sign-in is a candidate, not implemented authentication.

**Spec:** docs/agents/NATIVE_VISUAL_PARITY.md; user authorization on 2026-10-28 supersedes its requirement to stop all implementation until live proof.

**Constraints:** No edits to openbot/. No new runtime/dependencies. No provider key in iOS. No automatic retries or fabricated pending tool IDs. No cloud deployment or claimed live execution. Personal records remain local by default; cloud sessions necessarily process submitted content. Cloud ownership/authorization and unattended execution storage remain separate pending work.

**Review focus:** stale or absent pending call; cross-session identity; lost POST response; secret-bearing provider errors; actual disk persistence. Gateway authorization is not provided by this internal provider client.

## Task 1: Provider session adapter

Files: gateway/agents-client.mjs, gateway/tests/agents-client.test.mjs, gateway/README.md.
Interface: AgentsClient({apiKey, fetchImpl?}); createSession({model,instructions,input,tools}, submissionKey), retrieveSession(sessionID), sendMessage(sessionID,text,submissionKey), submitToolResult(sessionID,{turnID,callID,name,output},submissionKey).
- [x] Write tests with a local HTTP provider stub, observing real request paths, beta/auth/idempotency headers, exact JSON, and returned values. Test current required_actions lookup, refusal of history-only or mismatched calls, malformed identity, generic sanitized HTTP/network errors, no retry after a lost response, and missing key.
- [x] Run node --test gateway/tests/*.test.mjs; confirm RED for missing adapter.
- [x] Implement minimal fetch adapter against official Agents API routes; retrieve pending state before returning a tool result. Explicit model; environment none. Requests time out and never retry automatically.
- [x] Run complete gateway tests and record GREEN. Document internal-only scope and next server requirements.

## Task 2: Native persistence and baseline evidence

Files: ios/EuphoriaTests/VisualPersistenceTests.swift, ios/scripts/verify-xcode.sh, docs/agents/TEST_EVIDENCE.md, docs/agents/SPIKE_HANDOFF.md.
- [x] Add a real on-disk SwiftData save/reopen test with a fresh ModelContainer; verify draft and queued action unchanged. This tests existing behavior, not a claimed new feature.
- [x] Update expected test count to nine; run portable Swift core tests plus repository Debug/Release/XCTest script.
- [x] Update current evidence and distinguish local tests, provider contract tests, native interaction, and live execution.
- [x] Fresh whole-change review; fix important findings with regression tests. Keep branch unmerged and unpushed.

Execution: all tasks completed for this bounded milestone; phase one remains unfinished. Review fixed empty202 handling and error-cleanup sanitization via two RED→GREEN regressions. No new native UX, cloud deployment, provider key or store added.
