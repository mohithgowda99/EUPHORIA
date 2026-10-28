# A2UI branch integration handoff

**Isolation:** \`feature/native-a2ui-genui-parity\`, forked from latest integration \`aeb65d32cd7225ed378d4273b72e13012a6d883a\`. No other agent's gateway, task, recovery, pagination, session or app-routing files were touched. No merge performed.

## New modules and fixtures

- \`ios/VisualRuntimeCore/Sources/VisualRuntimeCore/A2UIComposition.swift\`: value-only Codable v0.9 subset, validation, nested ID layout, typed shared binding paths, draft precedence, revisioned replacement/subtree updates, pure event intent. No independent persistence, provider or effect executor.
- \`ios/VisualRuntimeCore/Sources/VisualRuntimeCore/A2UICompositionView.swift\`: native recursive SwiftUI rendering, accepting parent \`Binding<A2UIDocument>\` and \`onAction: (A2UIActionIntent)->Void\`; no screen/navigation changes.
- \`ios/VisualRuntimeCore/Sources/VisualRuntimeCore/Fixtures/a2ui-nested-trip-v09.json\` and \`a2ui-choice-deployment-v09.json\`: two materially different *offline* pinned v0.9 source-shaped graphs.
- \`ios/VisualRuntimeCore/Tests/VisualRuntimeCoreTests/A2UICompositionTests.swift\`, \`A2UISourceFixtureTests.swift\`: 12 executed portable Swift tests, no failures.
- \`docs/a2ui-parity/*\`: 18-component catalog matrix, cross-feature audit and separately reviewed interactive artifact event proposal.

The existing \`VisualRuntimeCore\` SwiftPM target automatically discovers new .swift files and processes the existing \`Fixtures\` directory. The Xcode project and app routing are **not modified**; native iOS build remains a later integration gate.

## Required shared-file edits, explicitly deferred to integration

1. Reuse existing \`VisualState\`, \`VisualSnapshot\` and SwiftData container to archive a validated, versioned \`A2UIDocument\` as a contained value. Do not create a second cache/store or auto-send edits. Integration agent owns snapshot migration and relaunch tests.
2. Reuse existing gateway owner/session checks and SQLite operation journal. Normalize actual provider tool calls into server-validated source operations, bind \`A2UIActionIntent\` to the specific pending provider call, persist intent before delivery and await authoritative acknowledgement. The new native module does NOT execute tools or talk directly to Agents API.
3. Add one source-derived node-dispatch route to the app shell so \`A2UICompositionView\` receives a SwiftData-backed \`Binding\` and closure to existing gateway journal. Do not replace the main chat, Tasks, pagination, recovery or multi-agent flow.
4. For GenUI keep \`GeneratedArtifactView\` and \`ArtifactPolicy\` unchanged. Any future JavaScript action bridge needs separate security review and exact event permission enforcement. Preserve arbitrary interactive HTML/JS in sandbox, not a fake card.
5. Run \`cd ios/VisualRuntimeCore && swift test\`; Debug/Release iOS 27 builds and real XCTest; native interaction, SwiftData termination/relaunch, dynamic tree changes, and an actual OpenAI function call→UI→action→revision2 test on the integration branch.

## Known gaps

Only eight v0.9 source types are handled in this first slice. Unimplemented catalog types: Image, Icon, Video, AudioPlayer, List, Tabs, Modal, Divider, Slider, DateTimeInput. Also unsupported: dynamic repeated child lists, relative/array/escaped paths, source functions, several presentation props, arbitrary Markdown, streamed protocol operation parser, dynamic gallery/published components, sandboxed generated artifact action channel, full OpenDuet history and tool renderers. Every unsupported shape must fail or remain explicitly unavailable, not appear as working parity.

**Measured only:** Linux Swift 6.2.1 portable XCTest 12/12. No Xcode/simulator or live inference test run by this branch. The other agent retains ownership of provider delivery recovery and session workflow.
