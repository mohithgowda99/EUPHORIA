# A2UI branch integration plan

> Superpowers executing-plans inline; TDD plus fresh final review and one regression fix pass.

**Goal:** Safely integrate branch29e80e0 into current native app while preserving single canonical state and delivery authority.
**Spec:** ../specs/2026-10-28-a2ui-branch-integration-design.md
**Architecture:** Existing VisualNodesView dispatch → contained validated source graph → existing values/pending/VisualSnapshot. Live gateway source-form adapter unchanged; full graph delivery gated.

- [x] Baseline source merge --no-commit, run SwiftPM and record actual platform compilation errors.
- [x] RED security/semantics regressions for catalog, initial/shared choices, exact Unicode, repeated nodes, typed controls, bounded properties/localEdits.
- [x] Refactor recursion to nominal node view; harden value boundaries and preserve pinned source semantics. No arbitrary code/JS bridge.
- [x] RED canonical sourceComposition/setField/submitForm/restore/stale identity tests; add contained node dispatch and derived drafts using existing values/pending. Register iOS sources/resources.
- [x] Add on-disk SwiftData source composition pending/reopen tests and two Developer fixture paths. No paid calls.
- [x] Combined gateway/core/Debug/Release/native gates; fixture interaction/re-entry. Fresh review, fix important findings with RED→GREEN.
- [x] Commit merge with source history, current evidence/limits, and push authorized integration feature branch. Main untouched.
