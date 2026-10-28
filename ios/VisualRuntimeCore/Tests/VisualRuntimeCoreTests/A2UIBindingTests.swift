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

}
