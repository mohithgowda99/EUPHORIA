import XCTest
@testable import VisualRuntimeCore

final class A2UIBindingTests: XCTestCase {
    private func edit(_ state: inout VisualState, _ field: String, _ value: VisualScalar) throws {
        try state.apply(VisualAction(id: UUID().uuidString, surfaceID: state.surface.surfaceID,
            expectedRevision: state.surface.revision, nodeID: "form", kind: .setField, values: [field: value]))
    }
    private func choose(_ state: inout VisualState, _ field: String, _ option: String) throws {
        try edit(&state, field, state.proposedChoiceValue(nodeID: "form", fieldID: field, optionID: option))
    }
    func testTypedDefaultsAndSelectionInteractionsPreserveSourceSemantics() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiControlsSurface())
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text("Paris"), "field_1": .flag(false), "field_2": .strings([]), "field_3": .strings(["walk"])])
        try edit(&state, "field_1", .flag(true))
        try choose(&state, "field_2", "email")
        try choose(&state, "field_2", "push")
        try choose(&state, "field_3", "run")
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings(["walk", "run"]))
        try choose(&state, "field_3", "walk")
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text("Paris"), "field_1": .flag(true), "field_2": .strings(["push"]), "field_3": .strings(["run"])])
        XCTAssertTrue(state.pending.isEmpty, "Draft controls must not submit external operations")
        let values = try state.proposedFormValues(nodeID: "form")
        try state.apply(VisualAction(id: "confirm", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .submitForm, values: values))
        XCTAssertEqual(state.pending.count, 1)
        XCTAssertThrowsError(try edit(&state, "field_1", .flag(false)))
        XCTAssertThrowsError(try choose(&state, "field_3", "walk"))
    }
    func testForgedTypedEditsFailWithoutMutatingOrQueuing() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiControlsSurface())
        let original = state
        for (field,value): (String, VisualScalar) in [("field_1", .text("false")), ("field_2", .text("email")), ("field_2", .strings(["email","push"])), ("field_3", .strings(["unknown"])), ("field_3", .strings(["walk","walk"])), ("field_0", .flag(true))] {
            XCTAssertThrowsError(try edit(&state, field, value))
            XCTAssertEqual(state, original)
        }
    }
    func testFalseEmptyAndSelectedValuesSurviveCodingAndResetOnNewRevision() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiControlsSurface())
        try edit(&state, "field_1", .flag(false)); try edit(&state, "field_3", .strings([]))
        try choose(&state, "field_2", "push")
        state = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_1"], .flag(false))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings([]))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_2"], .strings(["push"]))
        let next = try VisualSurface(surfaceID: state.surface.surfaceID, revision: 1, nodes: state.surface.nodes, schemaVersion: 2)
        try state.reconcile(next, acknowledgedActionIDs: [])
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_2"], .strings([]))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings(["walk"]))
    }
    func testWireEncodingUsesRealBooleanAndStringArraysAndRejectsUnboundedLists() throws {
        let state = VisualState(surface: try SourceFixtures.a2uiControlsSurface())
        let action = VisualAction(id: "a", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .submitForm, values: try state.proposedFormValues(nodeID: "form"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(action)) as? [String: Any])
        let values = try XCTUnwrap(json["values"] as? [String: Any])
        XCTAssertEqual(values["field_1"] as? Bool, false)
        XCTAssertEqual(values["field_2"] as? [String], [])
        XCTAssertEqual(values["field_3"] as? [String], ["walk"])
        let oversized = try JSONSerialization.data(withJSONObject: Array(repeating: "x", count: 21))
        XCTAssertThrowsError(try JSONDecoder().decode(VisualScalar.self, from: oversized))
        XCTAssertThrowsError(try JSONDecoder().decode(VisualScalar.self, from: Data("[true]".utf8)))
    }
    func testIndependentSourceFixturesDoNotShareOfflinePersistenceIdentity() throws {
        XCTAssertNotEqual(try SourceFixtures.a2uiFormSurface().surfaceID, try SourceFixtures.a2uiControlsSurface().surfaceID)
    }

    private func unicodeState(_ values: [String]) throws -> VisualState {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(SourceFixtures.a2uiControlsSurface())) as? [String: Any])
        var nodes = try XCTUnwrap(json["nodes"] as? [[String: Any]])
        var fields = try XCTUnwrap(nodes[0]["fields"] as? [[String: Any]])
        fields[3]["choices"] = values.enumerated().map { ["id": $0.element, "label": "Option \($0.offset)"] }
        fields[3]["initialValue"] = [String]()
        nodes[0]["fields"] = fields; json["nodes"] = nodes
        return VisualState(surface: try JSONDecoder().decode(VisualSurface.self, from: JSONSerialization.data(withJSONObject: json)))
    }
    func testUnicodeChoiceIdentityMatchesExactGatewayStringSequences() throws {
        let composed = "\u{e9}", decomposed = "e\u{301}"
        var state = try unicodeState([composed, decomposed])
        try choose(&state, "field_3", composed); try choose(&state, "field_3", decomposed)
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings([composed, decomposed]))
        try choose(&state, "field_3", composed)
        XCTAssertFalse(state.formChoiceIsSelected(nodeID: "form", fieldID: "field_3", optionID: composed))
        XCTAssertTrue(state.formChoiceIsSelected(nodeID: "form", fieldID: "field_3", optionID: decomposed))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings([decomposed]))
    }
    func testCanonicalEquivalentButUnsupportedChoiceIsRejectedLocally() throws {
        let composed = "\u{e9}", decomposed = "e\u{301}"
        var state = try unicodeState([composed])
        XCTAssertThrowsError(try edit(&state, "field_3", .strings([decomposed])))
        XCTAssertThrowsError(try state.proposedChoiceValue(nodeID: "form", fieldID: "field_3", optionID: decomposed))
        XCTAssertTrue(state.pending.isEmpty)
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form")["field_3"], .strings([]))
    }
    func testWireValuesAndChoiceMetadataDoNotNormalizeUnicode() throws {
        let composed = "\u{e9}", decomposed = "e\u{301}"
        XCTAssertNotEqual(VisualScalar.text(composed), VisualScalar.text(decomposed))
        XCTAssertNotEqual(VisualScalar.strings([composed]), VisualScalar.strings([decomposed]))
        XCTAssertNotEqual(VisualOption(id: composed, label: "Same"), VisualOption(id: decomposed, label: "Same"))
        XCTAssertNotEqual(VisualOption(id: composed, label: "Same").wireID, VisualOption(id: decomposed, label: "Same").wireID)
        let list = VisualScalar.strings([composed, decomposed])
        XCTAssertEqual(try JSONDecoder().decode(VisualScalar.self, from: JSONEncoder().encode(list)), list)
    }

}
