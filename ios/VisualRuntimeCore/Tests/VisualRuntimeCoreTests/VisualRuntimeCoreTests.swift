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
        let s = try fixture()
        var encoded = try JSONEncoder().encode(s)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        json["schemaVersion"] = 99
        encoded = try JSONSerialization.data(withJSONObject: json)
        XCTAssertThrowsError(try JSONDecoder().decode(VisualSurface.self, from: encoded))
        json["nodes"] = [["id":"x", "kind":"script", "title":"Run arbitrary JS"]]
        encoded = try JSONSerialization.data(withJSONObject: json)
        XCTAssertThrowsError(try JSONDecoder().decode(VisualSurface.self, from: encoded))
    }
    func testDecodeRejectsInvalidSurfaceBeforeRendering() throws {
        let invalid = Data(#"{"schemaVersion":1,"surfaceID":"x","revision":0,"nodes":[]}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(VisualSurface.self, from: invalid))
    }
    func testSameRevisionCannotReplaceContent() throws {
        var state = VisualState(surface: try fixture())
        let changed = try VisualSurface(surfaceID: state.surface.surfaceID, revision: state.surface.revision,
            nodes: [VisualNode(id: "changed", kind: .askApproval, title: "Changed")])
        XCTAssertThrowsError(try state.reconcile(changed, acknowledgedActionIDs: []))
    }
    func testAcknowledgedCheckboxOverlayYieldsToServerButLaterEditSurvives() throws {
        var state = VisualState(surface: try fixture())
        try state.apply(action(state, node: "page_tasks", kind: .toggle,
            values: ["item": .text("review"), "checked": .flag(true)], id: "first"))
        let next = try VisualSurface(surfaceID: state.surface.surfaceID, revision: 2, nodes: state.surface.nodes)
        try state.reconcile(next, acknowledgedActionIDs: ["first"])
        XCTAssertNil(state.values["page_tasks.review"])
        try state.apply(action(state, node: "page_tasks", kind: .toggle,
            values: ["item": .text("review"), "checked": .flag(true)], id: "second"))
        try state.apply(action(state, node: "page_tasks", kind: .toggle,
            values: ["item": .text("review"), "checked": .flag(false)], id: "third"))
        try state.reconcile(next, acknowledgedActionIDs: ["second"])
        XCTAssertEqual(state.values["page_tasks.review"], .flag(false))
        XCTAssertEqual(state.pending.map(\.id), ["third"])
    }

    func testAcceptedDecisionRemainsLockedAcrossSnapshotRestore() throws {
        var state = VisualState(surface: try fixture())
        let a = action(state, node: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")], id: "accepted")
        try state.apply(a)
        try state.reconcile(state.surface, acknowledgedActionIDs: ["accepted"], resolvedNodeIDs: ["deployment"])
        XCTAssertTrue(state.pending.isEmpty)
        let restored = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(restored.resolvedNodeIDs, ["deployment"])
        var copy = restored
        XCTAssertThrowsError(try copy.apply(action(copy, node: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")], id: "other")))
    }
    func testLegacySnapshotWithoutResolvedNodesStillRestores() throws {
        let state = VisualState(surface: try fixture())
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as? [String: Any])
        json.removeValue(forKey: "resolvedNodeIDs")
        let restored = try JSONDecoder().decode(VisualState.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(restored.surface, state.surface)
        XCTAssertTrue(restored.resolvedNodeIDs.isEmpty)
    }

    func testRejectedDecisionUnlocksWithoutReplayingIt() throws {
        var state = VisualState(surface: try fixture())
        try state.apply(action(state, node: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")], id: "unsent"))
        try state.reconcile(state.surface, acknowledgedActionIDs: [], rejectedActionIDs: ["unsent"])
        XCTAssertTrue(state.pending.isEmpty)
        XCTAssertNil(state.values["deployment"])
        XCTAssertNoThrow(try state.apply(action(state, node: "deployment", kind: .choose,
            values: ["choice": .text("staging"), "label": .text("Staging")], id: "fresh")))
    }

    func testApprovalNoteDraftPersistsWithoutSubmittingAndIsIsolated() throws {
        var state = VisualState(surface: try fixture())
        try state.apply(action(state, node: "refund", kind: .setField, values: ["note": .text("Check the duplicate charge")]))
        XCTAssertTrue(state.pending.isEmpty)
        let loaded = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(loaded.approvalNote(nodeID: "refund"), "Check the duplicate charge")
        XCTAssertEqual(loaded.approvalNote(nodeID: "deployment"), "")
        let next = try VisualSurface(surfaceID: state.surface.surfaceID, revision: 2, nodes: state.surface.nodes)
        try state.reconcile(next, acknowledgedActionIDs: [])
        XCTAssertEqual(state.approvalNote(nodeID: "refund"), "", "New revision must not inherit a previous decision's draft")
    }
    func testApprovalNoteLocksWhileDecisionPendingAndRejectsNonText() throws {
        var state = VisualState(surface: try fixture())
        XCTAssertThrowsError(try state.apply(action(state, node: "refund", kind: .setField, values: ["note": .number(4)])))
        XCTAssertThrowsError(try state.apply(action(state, node: "refund", kind: .decide,
            values: ["decision": .text("approved"), "note": .flag(true)])))
        try state.apply(action(state, node: "refund", kind: .setField, values: ["note": .text("Review")]))
        try state.apply(action(state, node: "refund", kind: .decide,
            values: ["decision": .text("declined"), "note": .text(state.approvalNote(nodeID: "refund"))]))
        XCTAssertEqual(state.pending.last?.values["note"], .text("Review"))
        XCTAssertThrowsError(try state.apply(action(state, node: "refund", kind: .setField, values: ["note": .text("Changed")])) )
    }

    func testSourceFormDefaultsEditsAndEmptyStringsSurviveReopenWithoutTrimming() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiFormSurface())
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text("Paris")])
        for raw in ["Kyoto", "  Kyoto  ", "", "  "] {
            try state.apply(VisualAction(id: UUID().uuidString, surfaceID: state.surface.surfaceID,
                expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text(raw)]))
            state = try JSONDecoder().decode(VisualState.self, from: JSONEncoder().encode(state))
            XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text(raw)])
        }
        let values = try state.proposedFormValues(nodeID: "form")
        try state.apply(VisualAction(id: "submit", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .submitForm, values: values))
        XCTAssertThrowsError(try state.apply(VisualAction(id: "late", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text("Changed")])))
        XCTAssertEqual(state.pending.first?.values, ["field_0": .text("  ")])
    }
    func testMalformedSourceEventBindingFailsBeforeNativePresentation() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(SourceFixtures.a2uiFormSurface())) as? [String: Any])
        var nodes = try XCTUnwrap(json["nodes"] as? [[String: Any]])
        var event = try XCTUnwrap(nodes[0]["formEvent"] as? [String: Any])
        event["contextFields"] = ["destination":"unknown_field"]
        nodes[0]["formEvent"] = event; json["nodes"] = nodes
        XCTAssertThrowsError(try JSONDecoder().decode(VisualSurface.self, from: JSONSerialization.data(withJSONObject: json)))
    }

    func testNewSourceRevisionDoesNotReusePreviousFormDraft() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiFormSurface())
        try state.apply(VisualAction(id: "edit", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text("Kyoto")]))
        let next = try VisualSurface(surfaceID: state.surface.surfaceID, revision: 1, nodes: state.surface.nodes, schemaVersion: 2)
        try state.reconcile(next, acknowledgedActionIDs: [])
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text("Paris")])
    }

    func testUnicodeSourceDraftLimitMatchesGatewayAndDoesNotQueueRejectedValue() throws {
        var state = VisualState(surface: try SourceFixtures.a2uiFormSurface())
        let accepted = String(repeating: "😀", count: 1000)
        try state.apply(VisualAction(id: "valid", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text(accepted)]))
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text(accepted)])
        XCTAssertThrowsError(try state.apply(VisualAction(id: "too-long", surfaceID: state.surface.surfaceID, expectedRevision: 0, nodeID: "form", kind: .setField, values: ["field_0": .text(accepted + "😀")])))
        XCTAssertTrue(state.pending.isEmpty)
        XCTAssertEqual(try state.proposedFormValues(nodeID: "form"), ["field_0": .text(accepted)])
    }

}
