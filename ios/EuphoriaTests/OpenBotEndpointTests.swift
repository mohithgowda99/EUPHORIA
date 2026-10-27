import XCTest
@testable import Euphoria

final class OpenBotEndpointTests: XCTestCase {
    func testValidHTTPSOrigin() throws {
        let endpoint = try OpenBotEndpoint(" https://openbot.example.com:8443/ ")
        XCTAssertEqual(endpoint.baseURL.absoluteString, "https://openbot.example.com:8443")
    }

    func testRejectsEmbeddedCredentials() {
        XCTAssertThrowsError(try OpenBotEndpoint("https://user:secret@openbot.example.com"))
    }

    func testRejectsPathQueryAndFragment() {
        for value in [
            "https://openbot.example.com/api",
            "https://openbot.example.com/?token=secret",
            "https://openbot.example.com/#token",
        ] {
            XCTAssertThrowsError(try OpenBotEndpoint(value), value)
        }
    }

    func testRejectsRemotePlainHTTP() {
        XCTAssertThrowsError(try OpenBotEndpoint("http://openbot.example.com"))
    }

    func testCapabilityDecodingPreservesServerFlags() throws {
        let data = Data(#"{"mode":"intelligence","durableHistory":true,"generativeUi":false,"authProviders":["google"],"ssoConfigured":true,"ssoRequired":false}"#.utf8)
        let flags = try JSONDecoder().decode(DeploymentCapabilities.self, from: data)
        XCTAssertEqual(flags.mode, "intelligence")
        XCTAssertEqual(flags.durableHistory, true)
        XCTAssertEqual(flags.generativeUi, false)
        XCTAssertEqual(flags.authProviders, ["google"])
        XCTAssertEqual(flags.ssoConfigured, true)
    }

    #if DEBUG
    func testAllowsDebugLoopbackOnly() throws {
        let endpoint = try OpenBotEndpoint("http://127.0.0.1:3001")
        XCTAssertEqual(endpoint.baseURL.scheme, "http")
    }
    #endif
}
