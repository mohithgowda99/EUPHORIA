import SwiftUI

@main
struct EuphoriaApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: VisualSnapshot.self)
    }
}
