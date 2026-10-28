import Foundation

/// A fresh opaque origin per artifact, with no network, frame, form or native-bridge authority.
public struct ArtifactPolicy: Sendable {
    public let documentURL: URL
    public init() { documentURL = URL(string: "euphoria-artifact://" + UUID().uuidString.lowercased() + "/index.html")! }
    public func allowsNavigation(_ url: URL?) -> Bool { url == documentURL }
    public static let csp = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; media-src data: blob:"
    public func document(html: String) -> Data {
        Data(("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"" + Self.csp + "\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>" + html + "</body></html>").utf8)
    }
}
