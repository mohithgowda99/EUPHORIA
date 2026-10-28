import XCTest
@testable import VisualRuntimeCore

final class A2UIControlSelectionTests: XCTestCase {
    func testIndependentTabsRetainStableChildIdentityAfterReorder() {
        let first = ["overview", "history"]
        let second = ["activity", "settings"]
        var selectionByComponentID = ["tabsA": "history", "tabsB": "settings"]
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: selectionByComponentID["tabsA"], available: first), "history")
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: selectionByComponentID["tabsB"], available: second), "settings")
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: selectionByComponentID["tabsA"], available: first.reversed()), "history")
        selectionByComponentID["tabsA"] = "overview"
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: selectionByComponentID["tabsB"], available: second), "settings")
    }

    func testRemovedChildFallsBackWithoutInvalidSelection() {
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: "removed", available: ["new", "next"]), "new")
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: "removed", available: []), nil)
        XCTAssertEqual(A2UIControlSelection.resolvedChild(
            selected: nil, available: ["first"]), "first")
    }

    func testModalIDsDoNotSharePresentationState() {
        var presented = Set<String>()
        presented.insert("modalA")
        XCTAssertTrue(presented.contains("modalA"))
        XCTAssertFalse(presented.contains("modalB"))
        presented.insert("modalB")
        presented.remove("modalA")
        XCTAssertFalse(presented.contains("modalA"))
        XCTAssertTrue(presented.contains("modalB"))
    }
}
