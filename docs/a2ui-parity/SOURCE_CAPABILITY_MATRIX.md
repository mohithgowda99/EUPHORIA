# EUPHORIA native A2UI and GenUI: source-backed parity register

**Baseline:** OpenDuet source at 5b0e15f9719db0628c02a3fe6386dcad683c8302; latest integration branch at isolated fork aeb65d32cd7225ed378d4273b72e13012a6d883a (2026-10-28). **Status: bounded fixture-tested subset, NOT complete A2UI/GenUI parity.**

## Pinned implementation and protocol

- OpenDuet \`openbot/app/package.json\` pins \`@copilotkit/a2ui-renderer=1.77.0\`, \`@copilotkit/react-core=1.77.0\`, \`@ag-ui/core=1.0.1\`; project source research also pins \`@a2ui/web_core=0.10.4\`, A2UI v0.9. Do **not** silently substitute newer v1.0 catalog semantics.
- \`openbot/app/src/lib/copilot/a2ui.tsx\`: wraps the SDK's \`basicCatalog.components.values()\` without reimplementing its bindings/actions, provides \`a2uiProviderOptions\` capability gate.
- \`openbot/app/src/lib/copilot/provider.tsx\`: invokes the React CopilotKit v2 runtime and enables A2UI and separate \`openGenerativeUI\` when configured.
- Protocol definitions: https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/server_to_client.json ; https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/common_types.json ; https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/json/client_to_server.json ; https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/catalogs/basic/catalog.json . These are source reference schemas, **not immutable proof of exact npm 1.77.0/0.10.4 tarball bytes**. Independently inspect installed lockfile/package copies before claiming full conformance.
- Source operations: \`createSurface\` before \`updateComponents\` and \`updateDataModel\`; \`deleteSurface\` removes a surface. Components are ID-referenced, root component \`root\`; \`updateComponents\` is a full replacement, \`updateDataModel\` replaces/removes subtree. Data binding uses \`{path:"/absolute/path"}\`. User event is \`{name,surfaceId,sourceComponentId,timestamp,context}\`, with context resolved against current data model.

## All 18 basic catalog components

For each component, **state changes, streaming, native status and replay** are recorded explicitly. S = source-schema-shaped portable Swift fixtures; P = partial native implementation, simulator **not** verified; U = unimplemented. General v0.9 bindings may also be dynamic function calls; **this slice rejects executable expressions**.

| Type | Source properties / layout / actions | Binding, updates and expected restoration | Status and exact parity test required |
|---|---|---|---|
| Text | text, variant body/h1-h5/caption | string bound by path; updated content persists | **S/P** plain text and variants. Test Markdown, styled text, streamed updates, native snapshot |
| Image | url, description, fit, variant | bound URL; load/error and image layout | **U** permitted URL, image loading/cache, reload and fit |
| Icon | catalog icon name | fixed glyph, stable ID | **U** icon mappings and missing-name refusal |
| Video | url | remote video and controls | **U** safe media origins, lifecycle, offline reload |
| AudioPlayer | url, description | media playback | **U** playback controls, session interruption and restore |
| Row | child IDs/list template, justify, align | insert/replace/remove stable referenced IDs | **S/P** static children only; test align/justify, template list, dynamic rearrangement |
| Column | child IDs/list template, justify, align | nested stable IDs and updates | **S/P** static children only; test dynamic template/layout variants |
| List | children, direction, align | repeated data-backed rows | **U** template expansion, identity, pagination, selection, virtualization |
| Card | single child ID | nested wrapper with stable child identity | **S/P** test exact layout/style and preservation across replacements |
| Tabs | tabs and child refs | selected tab and child visibility | **U** selection/events and native restoration |
| Modal | trigger, content child | show/dismiss with blocked underlying UI | **U** focus/keyboard/presentation/restore |
| Divider | axis | horizontal/vertical orientation | **U** layout variants |
| Button | child, variant, action event or functionCall | typed context resolved on press, agent-facing action | **S/P** event-only; validate journaled receipt and real tool continuation; functionCall unsupported |
| TextField | label, value, variant, validationRegexp | local editable string to shared bound model | **S/P** plain native text only; test validationRegexp/variant and shared data updates |
| CheckBox | label, boolean value | two-way boolean edits, shared bindings | **S/P** toggle with bound state, preserve false/true across updates and relaunch |
| ChoicePicker | options, label, value, variant, displayStyle, filterable | selected string **array**, including exclusive mode | **S/P** fixed options/exclusive or multiple; test dynamic labels/options/filter/display style |
| Slider | min/max/value/label | bound number/step/clamp | **U** numeric constraints, model changes, relaunch |
| DateTimeInput | ISO string, enableDate/Time, min/max/label | date/time picker binds string | **U** date format, timezone, locale, validation |

**Current slice:** \`A2UIDocument\` Codable value, \`A2UICompositionView\` recursive SwiftUI, stable component IDs, nested Row/Column/Card, Text/Button/TextField/CheckBox/ChoicePicker, bounded absolute object paths, source-shaped action context, draft precedence, replacement and subtree updates, revision checks, intentional explicit unsupported errors. This does not replace the existing SwiftData model or gateway journal.

**Unsupported cross-cutting protocol:** dynamic child template lists, general JSON Pointer array segments/escaped keys, relative and function bindings, arbitrary nested action literals, theme, true partial streamed operation parser, multi-surface coordination, deleteSurface handling, full v0.9 client metadata and real tool-result handoff. All remain unverified.

## Other OpenDuet visual families (distinct from the A2UI basic catalog)

| Family | Source / lifecycle | State, action, streaming, persistence | Current parity and required acceptance |
|---|---|---|---|
| Open GenUI | \`lib/copilot/generative-ui.ts\`, \`provider.tsx\` | arbitrary generated HTML/CSS/JS; iframe theme messages, no session access | **Partial existing** \`GeneratedArtifactView.swift\`, \`ArtifactPolicy.swift\` sandbox. Generated publish/action/version restore **U**. Real WebKit network/native/nav tests required |
| Gallery discovery | \`lib/copilot/gallery-registry.ts\`, \`gallery-tools.tsx\` | eagerly sorted \`GALLERY\` entries, \`name/title/kind/description/parameters/preview/confirmation/reads\`, per-Bot grants and runtime-published descriptions | **Partial existing** native gallery. Dynamic grants, refusal history, source schema exactness **U**; test revoke/regrant |
| Gallery cards and tables | \`components/gallery/{cards,charts,table}.tsx\` | showRecord, showMetrics, showChecklist (read-only), showNotice, 5 charts, sortable table | **Partial existing** native cards/charts. Test each schema/format/empty state and history |
| HITL decisions | \`components/gallery/{decisions,form}.tsx\`, \`gallery-tools.tsx\` | askChoice → \`{choice,label}\`; askApproval → \`{decision,note?}\`; askForm → \`{status:"submitted",values}\`; result resumes run | **Partial existing** native choice/form/approval. Real suspend/resume, duplicate prevention, expired decision and restored tool result **U** |
| Runtime published custom content | \`lib/copilot/sandboxed-tools.tsx\`, \`server/src/components/*\` | component JSON Schema, per-call args, HTML/CSS/JS, grants, refusal | **U** verified publication, runtime registry, authoring and isolation |
| Computer/frontend tool rendering | \`lib/copilot/{approval-tools,computer-tools,bot-tools,skill-tools,sign-in-tool}.tsx\` | render states, toolCall ID/result, per-Bot grants; mutating computer 202 stops, server executes and resumes | **U** real equivalent services. Never fake no-op tool execution |
| Rich pages and Make | \`components/duet/{page-view,page-rich-block,page-sheet}.tsx\`, \`page-card-tool.tsx\` | structured blocks and slides, checklist and list action callbacks; persisted index/revisions | **Partial existing** page checklist. Full page layout, interactive block updates and saved artifact revision **U** |
| Tasks/routines | \`components/duet/{task-card,task-report,morning-brief-card}.tsx\`, \`offer-task-tool.tsx\` | rendered status, scheduled work, callbacks, restart | **Other agent owns workflows**; visuals **U** until source-derived UI adapter tests |
| Handoff | \`lib/copilot/{handoff-tool,handoff-resume}.ts(x)\`, \`components/agents/handoff-panel.tsx\` | agent handoff state and resumption | **U** safe status/history rendering |
| Memory/persona | \`components/memory/*\`, memory/settings routes | provenance/edit/confirm/revoke with permissions | **U** native state, role/privacy and history |
| Browser/computer progress | \`components/computer/{live-screen,computer-panel,activity-log,computer-controls}.tsx\` | screen/approval/take-control/secret masking | **U** requires substantial execution infrastructure |
| History and artifact replay | \`lib/copilot/{bot-thread,thread-messages,repair-history}.ts(x)\`, \`GeneratedArtifactView.swift\`, \`VisualSnapshot.swift\` | persisted thread IDs, tool render/results, published artifact version, refusal and pending edits | **S/P** Codable value roundtrip. Real SwiftData + cloud replay/relaunch **U** |

## Actual evidence and acceptance

**Executed** Linux Swift 6.2.1, isolated proof package: \`swift test -j 2\` ⇒ **12 XCTest cases, 0 failures**, including 2 source-derived JSON layouts, shared text/boolean/list bindings, typed event context, insert/remove/replace, remote subtree update preserving unrelated draft, acknowledgement, malformed/unsupported/cycle/path refusal, validated decode and Codable restoration.

**Not executed** Xcode Debug/Release or iOS 27 XCTest, native SwiftUI manual interactions, actual SwiftData model lifecycle, GenUI WebKit sandbox regressions on this branch, real OpenAI session/tool continuation or scheduling. This source cannot be labeled full parity.

**Next acceptance:** independently pin/check 1.77.0/0.10.4 source, integrate immutable A2UI value into existing SwiftData snapshot, verify iOS build and two native fixtures, feed real tool call through existing authorized gateway journal, reconcile an agent update without duplicating external effect, kill/relaunch with same revision, then expand missing catalog types with failing conformance fixtures.
