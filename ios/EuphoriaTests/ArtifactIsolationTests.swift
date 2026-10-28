import XCTest
import WebKit
@testable import Euphoria

@MainActor
final class ArtifactIsolationTests: XCTestCase {
    func testInlineInteractionWorksWhileCSPBlocksNetworkAndNativeBridgeIsAbsent() async throws {
        let host = ArtifactHost()
        host.load(html: """
        <button id="test" onclick="document.body.dataset.clicked='yes'">Try</button>
        <script>
        document.body.dataset.inline='yes';
        document.addEventListener('securitypolicyviolation', e => {document.body.dataset.blocked=e.effectiveDirective;});
        fetch('https://example.invalid/artifact-must-not-connect').catch(()=>{});
        </script>
        """)
        var inline = ""
        for _ in 0..<100 {
            inline = (try? await evaluate(host.webView, "document.body.dataset.inline || ''")) ?? ""
            if inline == "yes" { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(inline, "yes")
        _ = try await evaluate(host.webView, "document.getElementById('test').click(); 'clicked'")
        let clicked = try await evaluate(host.webView, "document.body.dataset.clicked")
        XCTAssertEqual(clicked, "yes")
        var blocked = ""
        for _ in 0..<40 {
            blocked = try await evaluate(host.webView, "document.body.dataset.blocked || ''")
            if blocked == "connect-src" { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(blocked, "connect-src")
        let bridge = try await evaluate(host.webView, "String(!!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native))")
        XCTAssertEqual(bridge, "false")
        let rtc = try await evaluate(host.webView, "typeof RTCPeerConnection")
        XCTAssertEqual(rtc, "undefined")
        XCTAssertFalse(host.webView.configuration.websiteDataStore.isPersistent)
        XCTAssertTrue(host.responds(to: NSSelectorFromString("webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:")))
        XCTAssertTrue(host.responds(to: NSSelectorFromString("webView:requestGeolocationPermissionForOrigin:initiatedByFrame:decisionHandler:")))
        XCTAssertTrue(host.responds(to: NSSelectorFromString("webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:")))
        XCTAssertTrue(host.responds(to: NSSelectorFromString("webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:")))
    }
    func testDistinctArtifactsHaveSeparateOriginsAndSessionState() async throws {
        let first = ArtifactHost(), second = ArtifactHost()
        XCTAssertNotEqual(first.policy.documentURL, second.policy.documentURL)
        XCTAssertFalse(first.policy.allowsNavigation(second.policy.documentURL))
        XCTAssertFalse(first.policy.allowsNavigation(URL(string: "https://example.com")))
        XCTAssertFalse(first.webView.configuration.websiteDataStore === second.webView.configuration.websiteDataStore)
    }
    private func evaluate(_ view: WKWebView, _ script: String) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            view.evaluateJavaScript(script) { value, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: value as? String ?? "") }
            }
        }
    }
}
