import SwiftData

/// Durable outgoing message identity only, NOT a duplicate channel history.
/// Original OpenDuet DeliveryStore/offerInbox is the sole execution authority.
@Model
final class SourceMessageIntent {
    var ownerScope: String
    var channelID: String
    var botID: String
    var externalID: String
    var message: String

    init(ownerScope: String, channelID: String, botID: String, externalID: String, message: String) {
        self.ownerScope = ownerScope
        self.channelID = channelID
        self.botID = botID
        self.externalID = externalID
        self.message = message
    }
}
