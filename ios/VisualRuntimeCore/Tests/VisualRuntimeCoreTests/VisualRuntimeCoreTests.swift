import XCTest
@testable import VisualRuntimeCore

final class VisualRuntimeCoreTests: XCTestCase {
    private func fixture() throws -> VisualSurface { try SourceFixtures.surface() }
    private func action(_ state: VisualState, node: String, kind: VisualActionKind,
                        values: [String: VisualScalar], id: String = UUID().uuidString) -> VisualAction {
        VisualAction(id: id, surfaceID: state.surface.surfaceID,
                     expectedRevision: state.surface.revision, nodeID: node,
                     kind: kind, values: values)
    }
    func testFixtureHasFiveSourceDerivedContracts() throws {
        let s = try fixture()
        XCTAssertEqual(s.nodes.count, 5)
        XCTAssertEqual(Set(s.nodes.map(\.kind.rawValue)).count, 5)
    }
    func testChoiceProducesExactOpenDuetResponseShape() throws {
        var s = VisualState(surface: try fixture())
        try s.apply(action(s, node: "deployment", kind: .choose,
                           values: ["choice": .text("staging"), "label": .text("Staging")], id: "choose-1"))
        XCTAssertEqual(s.values["deployment"], .text("staging"))
        XCTAssertEqual(s.pending[0].values["choice"], .text("staging"))
        XCTAssertThrowsError(try s.apply(action(s, node: "deployment", kind: .choose,
                                                  values: ["choice": .text("production"), "label": .text("Production")])))
    }
    func testFormsValidateRequiredAndNumericFields() throws {
        var s = VisualState(surface: try fixture())
        XCTAssertThrowsError(try s.apply(action(s, node: "brief", kind: .submitForm, values: [:])))
        try s.apply(action(s, node: "brief", kind: .setField, values: ["team": .text("Euphoria")]))
        try s.apply(action(s, node: "brief", kind: .setField, values: ["email": .text("test@example.org")]))
        try s.apply(action(s, node: "brief", kind: .setField, values: ["seats": .text("4")]))
        let values = try s.proposedFormValues(nodeID: "brief")
        XCTAssertEqual(values["seats"], .number(4))
        try s.apply(action(s, node: "brief", kind: .submitForm, values: values))
        XCTAssertEqual(s.pending.last?.kind, .submitForm)
    }
    func testApprovalIsPendingOnlyNeverExecutedLocally() throws {
        var s = VisualState(surface: try fixture())
        try s.apply(action(s, node: "refund", kind: .decide,
                           values: ["decision": .text("declined"), "note": .text("Check charge")]))
        XCTAssertEqual(s.pending.count, 1)
        XCTAssertEqual(s.values["refund"], .text("declined"))
    }
    func testReportingChecklistRefusesMutationsButPageAllows() throws {
        var s = VisualState(surface: try fixture())
        let data: [String: VisualScalar] = ["item": .text("review"), "checked": .flag(true)]
        XCTAssertThrowsError(try s.apply(action(s, node: "release", kind: .toggle, values: data)))
        try s.apply(action(s, node: "page_tasks", kind: .toggle, values: data))
        XCTAssertEqual(s.values["page_tasks.review"], .flag(true))
    }
    func testStateRestoresQueuedActionsAfterEncoding() throws {
        var original = VisualState(surface: try fixture())
        try original.apply(action(original, node: "page_tasks", kind: .toggle,
                                  values: ["item": .text("review"), "checked": .flag(true)], id: "action-a"))
        let loaded = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(original))
        XCTAssertEqual(loaded, original)
        XCTAssertEqual(loaded.pending.map(\.id), ["action-a"])
    }
    func testAcknowledgmentOnlyAfterNewAuthoritativeRevision() throws {
        var s = VisualState(surface: try fixture())
        try s.apply(action(s, node: "page_tasks", kind: .toggle,
                           values: ["item": .text("review"), "checked": .flag(true)], id: "ack-1"))
        let next = try VisualSurface(surfaceID: s.surface.surfaceID, revision: 2, nodes: s.surface.nodes)
        try s.reconcile(next, acknowledgedActionIDs: ["ack-1"])
        XCTAssertTrue(s.pending.isEmpty)
        XCTAssertEqual(s.surface.revision, 2)
        XCTAssertThrowsError(try s.apply(VisualAction(id: "stale", surfaceID: s.surface.surfaceID,
            expectedRevision: 1, nodeID: "page_tasks", kind: .toggle,
            values: ["item": .text("review"), "checked": .flag(false)])))
    }
    func testRejectsUnknownKindsAndUnsupportedVersions() throws {
        var s = try fixture()
        var encoded = try JSONEncoder().encode(s)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        json["schemaVersion"] = 99
        encoded = try JSONSerialization.data(withJSONObject: json)
        s = try JSONDecoder().decode(VisualSurface.self, from: encoded)
        XCTAssertThrowsError(try s.validate())
        json["nodes"] = [["id":"x", "kind":"script", "title":"Run arbitrary JS"]]
        encoded = try JSONSerialization.data(withJSONObject: json)
        XCTAssertThrowsError(try JSONDecoder().decode(VisualSurface.self, from: encoded))
    }
}
