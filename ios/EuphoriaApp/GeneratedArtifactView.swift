import SwiftUI
import WebKit
import Observation

/// Only generated artifact content uses WebKit. The app shell, data and operations remain native.
struct GeneratedArtifactView: View {
    let html: String
    @State private var host = ArtifactHost()
    var body: some View {
        VStack(alignment: .leading) {
            if let error = host.errorMessage { Text(error).foregroundStyle(.secondary) }
            ArtifactWebContainer(host: host).frame(height: 360)
                .accessibilityLabel("Generated interactive artifact")
        }
        .task(id: html) { host.load(html: html) }
    }
}
private struct ArtifactWebContainer: UIViewRepresentable {
    let host: ArtifactHost
    func makeUIView(context: Context) -> WKWebView { host.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: ()) { view.stopLoading() }
}

@MainActor @Observable
final class ArtifactHost: NSObject, WKNavigationDelegate, WKUIDelegate {
    let policy: ArtifactPolicy
    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private let handler: ArtifactSchemeHandler
    @ObservationIgnored private var loadedHTML: String?
    private(set) var errorMessage: String?
    override init() {
        let policy = ArtifactPolicy(); self.policy = policy
        let handler = ArtifactSchemeHandler(policy: policy); self.handler = handler
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = WKUserContentController() // Deliberately no native message handlers.
        // WebRTC is not reliably constrained by connect-src. Remove network constructors before artifact code runs.
        configuration.userContentController.addUserScript(WKUserScript(source: """
        for (const name of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport']) {
          try { Object.defineProperty(globalThis, name, {value:undefined,writable:false,configurable:false}); } catch (_) {}
        }
        """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        configuration.setURLSchemeHandler(handler, forURLScheme: "euphoria-artifact")
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.allowsPictureInPictureMediaPlayback = false
        configuration.dataDetectorTypes = []
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.allowsLinkPreview = false
    }
    func load(html: String) {
        guard loadedHTML != html else { return }
        guard html.utf8.count <= 128000 else { errorMessage = "Generated artifact is too large."; return }
        loadedHTML = html; errorMessage = nil
        handler.document = policy.document(html: html)
        webView.load(URLRequest(url: policy.documentURL))
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        decisionHandler(policy.allowsNavigation(navigationAction.request.url) && navigationAction.targetFrame?.isMainFrame == true ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, requestGeolocationPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) { completionHandler(nil) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) { completionHandler() }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) { completionHandler(false) }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (String?) -> Void) { completionHandler(nil) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { errorMessage = "The generated artifact stopped. The native workspace is still available." }
}
@MainActor
private final class ArtifactSchemeHandler: NSObject, WKURLSchemeHandler {
    let policy: ArtifactPolicy
    var document = Data()
    init(policy: ArtifactPolicy) { self.policy = policy }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard policy.allowsNavigation(urlSchemeTask.request.url) else { urlSchemeTask.didFailWithError(URLError(.unsupportedURL)); return }
        urlSchemeTask.didReceive(URLResponse(url: policy.documentURL, mimeType: "text/html", expectedContentLength: document.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(document); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
