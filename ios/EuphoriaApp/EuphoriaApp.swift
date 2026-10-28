import SwiftUI
import SwiftData

@main
struct EuphoriaApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [VisualSnapshot.self, ConversationSnapshot.self, TaskCreationSnapshot.self, SourceMessageIntent.self, SourceTaskCreationIntent.self])
    }
}
