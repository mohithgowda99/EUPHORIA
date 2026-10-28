import Foundation

/// Canonical projections only. Provider events and raw tool payloads never enter this wire format.
public struct GatewayLiveUpdate: Decodable, Sendable {
    public let snapshot: GatewayEnvelope
    public let history: GatewayHistoryPage
    public let inputs: GatewayInputReceipts
    private enum CodingKeys: String, CodingKey { case snapshot, history, inputs }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        snapshot = try c.decode(GatewayEnvelope.self, forKey: .snapshot)
        history = try c.decode(GatewayHistoryPage.self, forKey: .history)
        inputs = try c.decode(GatewayInputReceipts.self, forKey: .inputs)
        guard let id = snapshot.sessionID, snapshot.publication.map({ $0 > 0 }) == true,
              history.sessionID == id, inputs.operations.count <= 500,
              Set(inputs.operations.map(\.id)).count == inputs.operations.count,
              inputs.operations.allSatisfy({ $0.id.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", options: .regularExpression) != nil }) else { throw GatewayClientError.invalidResponse }
        var proof = ConversationArchive(sessionID: id)
        try proof.apply(history, reset: true); try proof.reconcile(inputs.operations)
    }
}
struct GatewaySSEFrame { let event: String; let data: Data }
/// Byte-at-a-time interface keeps limits effective even when a peer never terminates its line.
struct GatewaySSEDecoder {
    let maxBytes: Int
    private var count = 0
    private var line: [UInt8] = []
    private var data: [String] = []
    private var event = "message"
    private var wasCR = false
    init(maxBytes: Int = 1024 * 1024) { self.maxBytes = maxBytes }
    mutating func append(_ byte: UInt8) throws -> GatewaySSEFrame? {
        count += 1; guard count <= maxBytes else { throw GatewayClientError.invalidResponse }
        if byte == 13 { let frame = try consumeLine(); wasCR = true; return frame }
        if byte == 10 {
            defer { wasCR = false }
            return wasCR ? nil : try consumeLine()
        }
        wasCR = false; line.append(byte); return nil
    }
    private mutating func consumeLine() throws -> GatewaySSEFrame? {
        guard let text = String(bytes: line, encoding: .utf8) else { throw GatewayClientError.invalidResponse }
        line.removeAll(keepingCapacity: true)
        if text.isEmpty {
            let frame = data.isEmpty ? nil : GatewaySSEFrame(event: event, data: Data(data.joined(separator: "\n").utf8))
            data.removeAll(keepingCapacity: true); event = "message"; count = 0
            return frame
        }
        if text.hasPrefix(":") { return nil }
        let parts = text.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        var value = parts.count == 2 ? String(parts[1]) : ""
        if value.hasPrefix(" ") { value.removeFirst() }
        if parts[0] == "data" { data.append(value) }
        else if parts[0] == "event" { event = value }
        return nil
    }
}
