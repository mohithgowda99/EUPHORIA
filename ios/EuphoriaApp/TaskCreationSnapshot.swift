import SwiftData

/// A client-side submission intent, NOT a second task store.
///
/// The server's owner-scoped `/v1/tasks` journal is authoritative. Keeping only
/// the stable request identity and exact payload allows an explicit retry of
/// the same idempotent request after a process death, never a new execution.
@Model
final class TaskCreationSnapshot {
    var scope: String
    var requestID: String
    var title: String
    var instruction: String

    init(scope: String, requestID: String, title: String, instruction: String) {
        self.scope = scope
        self.requestID = requestID
        self.title = title
        self.instruction = instruction
    }
}
