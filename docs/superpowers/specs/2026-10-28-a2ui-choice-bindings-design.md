# Native A2UI boolean and selection bindings

User approved proceeding with boolean/selection bindings after the source form adapter. Continue inline through the existing renderer, revision-scoped VisualState, SwiftData container and gateway action journal. No new runtime or domain store.

Source: pinned @copilotkit/a2ui-renderer1.77.0 CheckBox/ChoicePicker and @a2ui/web_core0.10.4 basic catalog. CheckBox writes boolean. ChoicePicker writes string arrays even for mutuallyExclusive; multipleSelection toggles membership while preserving order. Its pinned renderer treats omitted variant as multiple selection (isMutuallyExclusive checks equality; GenericBinder forwards supplied properties without schema defaults). Match that observed source behavior and test it explicitly.

Approach: extend existing VisualScalar wire data with a bounded string-list case, generalize field initialValue from string to that compatible typed value, and add source-only checkbox/choice field kinds. Existing encoded string defaults and scalar archives remain readable. The alternative of serializing choices into strings loses source types; a separate event/store/renderer would duplicate authority and recovery.

Normalized checkbox fields use native Toggle. Choice fields use labelled native selection buttons with state markers; labels and values stay distinct. Support explicit single/multiple modes, empty selections, false defaults and flat model paths. Bound lists <=20 unique supported values, each <=2000 UTF-16 units; <=20 options, scalar source event literals unchanged. Native and gateway enforce the same type/membership/cardinality rules. New control kinds require version2 and formEvent. Unsupported filters/chip layouts/dynamic labels/nested models/functions/validators remain explicit errors; no silent approximation.

Source edits remain local setField operations. Submit snapshots typed values once, preserving boolean/list types in resolved userAction context. Pending/resolved forms lock; rejected edits do not mutate state or queue effects. Revision isolation and on-disk reopen must retain false/empty/selected values. No actual provider or external effect is claimed.
