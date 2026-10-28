import SwiftData

/// An unsent or uncertain user request to the ORIGINAL OpenDuet task-intake
/// endpoint. Unlike the provider gateway, source POST has NO idempotency key.
/// Therefore a lost response is NEVER reissued automatically or with a new ID.
@Model
final class SourceTaskCreationIntent {
    var ownerScope: String
    var botID: String
    var title: String
    var instruction: String

    init(ownerScope: String, botID: String, title: String, instruction: String) {
        self.ownerScope = ownerScope
        self.botID = botID
        self.title = title
        self.instruction = instruction
    }
}
