import XCTest
@testable import VisualRuntimeCore

final class A2UIExtendedFixtureTests: XCTestCase {
    private func read(_ name: String) throws -> A2UIDocument {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(A2UIDocument.self, from: Data(contentsOf: url))
    }
    func testSettingsFixtureSharedNumericDraftAndRevisionRestores() throws {
        var doc = try read("a2ui-extended-settings-v09")
        XCTAssertEqual(try doc.value(id: "heading", property: "text"), .string("Preferences"))
        XCTAssertEqual(try doc.edit(componentID: "volume", value: .number(55)), "/settings/volume")
        try doc.updateDataModel(path: "/settings/title", value: .string("Personal settings"), revision: 1)
        XCTAssertEqual(try doc.value(id: "volume", property: "value"), .number(55))
        let reopened = try JSONDecoder().decode(A2UIDocument.self, from: JSONEncoder().encode(doc))
        XCTAssertEqual(reopened, doc)
    }
    func testStructurallyDifferentTabsFixtureDecodesAndRejectsUnsafeReplacement() throws {
        var doc = try read("a2ui-extended-tabs-v09")
        XCTAssertEqual(doc.components.first?.component, "Tabs")
        let bad = [A2UIComponent(id: "root", component: "Image", properties: ["url": .string("http://localhost/private")])]
        XCTAssertThrowsError(try doc.updateComponents(bad, revision: 1))
        XCTAssertEqual(doc.revision, 0)
    }
}
