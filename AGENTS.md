# EUPHORIA

Begin with this file, `docs/DECISIONS.md`, `docs/NOW.md`, then inspect the current branch and code. Keep these records small and current; detailed source inventory and executed evidence live under `docs/agents` and `docs/ios`.

- Phase one: reproduce OpenDuet functionality in an iOS app with a native SwiftUI shell and an OpenAI Agents API backend. Phase two: apply the ETERNAL visual experience. Do not silently narrow phase one to UI fixtures.
- OpenDuet is the functional reference. Standard app controls stay native. Only generated artifacts may use an isolated web view, as explicitly approved. No native bridge or credentials in artifact content.
- Reuse the existing validated visual state, SwiftData container, gateway ownership checks and SQLite operation journal. Persist intent before sending; unknown provider effects must not be replayed automatically. A proposed or approved action is not proof of external execution.
- Work in the existing feature checkout; preserve unrelated changes. Keep main and archived OpenBot/CopilotKit references untouched unless the user changes scope. Push the working feature branch when requested; do not merge implicitly.
- Read the actual source and pinned dependencies before claiming parity. Mark partial implementations and unsupported content explicitly. No no-op tools or fake successful effects.
- Use Superpowers end to end. Continue approved work without repeated permission questions. If contributors are used, the user's preferred model is GPT-6.1 Terra at medium.
- Validate with relevant gateway tests, Swift core tests, and Debug/Release plus iOS XCTest. Record unit evidence, actual provider execution, native manual interaction and human usability separately.
- API credentials stay server-side. Continue independent implementation while credentials are unavailable; check `docs/NOW.md` for current live-provider verification status. Production identity, hosting, integrations and computer execution need their own real implementations.
- After an accepted milestone, replace `docs/NOW.md` with current implementation, checks, remaining gaps and one next step. Add only explicit accepted product decisions to `docs/DECISIONS.md`. Never mark phase one complete from a fixture or compilation alone.
