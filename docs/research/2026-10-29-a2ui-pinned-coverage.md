# Pinned native A2UI coverage — Section 3 work in progress

Authority: BBC6BAE9/a2ui-swift `16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0`, linked by the existing app and renderer comparison package. Upstream decodability does not establish EUPHORIA authorization or usability. This audit is of that pinned implementation, not a claim of complete official A2UI conformance.

## Standard catalog admission

| Components | Current application admission | Remaining limitations |
| --- | --- | --- |
| Text | Literal/path text; heading/body/caption variants | Function expressions and common accessibility/weight properties not admitted |
| Row, Column | Static children; exact align/justify enums | Templates not admitted |
| Card | Exact child reference | Common properties not admitted |
| List | Static children; vertical/horizontal direction and alignment | Templates and array-index paths not admitted |
| Tabs | Bounded named children, literal/path titles | Native selected-tab restoration not yet verified |
| Modal | Exact trigger/content references | A trigger must actually activate (use Button); event buttons still dispatch through source authorization. No local-only action shortcut added. Native restoration not yet verified |
| Divider | Horizontal/vertical axis | Native visual acceptance pending |
| Icon | Bounded literal/path named symbols | Custom SVG objects not admitted; unknown upstream icon mapping can fall back |
| Button | Event action; primary/borderless variants; source-validated scalar context | Function-call actions/checks not admitted |
| TextField | Literal/path label/value | Other variants, regexp/checks not admitted |
| CheckBox | Literal/path label/boolean | Checks not admitted |
| ChoicePicker | Bound string-list, bounded options, single/multiple selection | Display style/filter/checks not admitted |
| Slider, DateTimeInput | Not yet admitted | Native bindings, numerical/date constraints and correction/restart evidence needed |
| Image, Video, AudioPlayer | Not yet admitted | Source-authorized URL/media policy and loading/failure behavior needed |

13 of 18 standard component kinds are admitted at this checkpoint. A component kind being admitted does not mean every standard property is supported. The existing gallery's tables/charts/metrics remain a separate existing native contract, not invented Basic Catalog components.

## Functions

`BasicFunctions.swift` registers **27** actual keys despite an outdated comment saying 26: add, subtract, multiply, divide, equals, not_equals, greater_than, less_than, and, or, not, capitalize, contains, starts_with, ends_with, required, regex, length, numeric, email, formatString, formatNumber, formatCurrency, formatDate, pluralize, openUrl, now.

All function expressions remain refused by application admission at this checkpoint. `openUrl` is effectful and cannot bypass the existing source permission/action boundary. `now` is time-dependent. Pure computation/validation functions need matching native/source semantics and bounded argument/error tests before admission; raw upstream availability is insufficient.

## Operations and authority

- Existing source input admits createSurface, revision-checked updateComponents upserts and updateDataModel subtree replacement/deletion in bounded batches. Resulting complete graph must validate atomically.
- deleteSurface is available in the pinned engine/projection bridge but is not yet a source operation; progressive incomplete graphs and component-field patches need separate evidence.
- One source-owned composition per visual surface; unsupported catalogs, functions, ambiguous objects, cycles, reused child identities, orphan nodes, unsafe paths and oversize payloads fail closed.
- Read-only compositions now receive an exact display receipt and complete/reopen using original source persistence. Button-bearing compositions cannot use that receipt to bypass a decision.
- Engine event names/context never grant authority; original authenticated source routes and canonical revision checks remain authoritative.

## Executed evidence for layout increment

Gateway 200/200; Swift core 80/80; pinned upstream comparison package 7/7, including shared synthetic layout tree. Contract RED observed before implementation in JavaScript and Swift. These are deterministic/offline tests, not Simulator usability or live-provider acceptance. New layout fixtures are identical in gateway and Swift core; no paid request was made.

Section 3 remains incomplete: controls/media/functions/progressive lifecycle and actual Simulator journeys are outstanding. Sections 4–5 have not started; Section 2's current partial checkpoint has not been integrated.
