import SwiftUI

/// OpenDuet's secondary product areas, grouped without changing the original
/// features or replacing them with mock pages. Every destination is native.
struct SourceMoreView: View {
    var body: some View {
        List {
            Section("Your Bots") {
                NavigationLink {
                    SourceMemoryView()
                } label: {
                    Label("Memory", systemImage: "brain.head.profile")
                }
                NavigationLink {
                    SourceApprovalsView()
                } label: {
                    Label("Questions and approvals", systemImage: "checkmark.shield")
                }
                NavigationLink {
                    SourceRoutinesView()
                } label: {
                    Label("Routines and responsibilities", systemImage: "calendar.badge.clock")
                }
            }
            Section("Create") {
                NavigationLink {
                    SourceGalleryView()
                } label: {
                    Label("Make and Gallery", systemImage: "square.stack")
                }
            }
            #if DEBUG
            Section("Engineering") {
                NavigationLink {
                    DevelopmentToolsView()
                } label: {
                    Label("Development acceptance tools", systemImage: "hammer")
                }
                Text("The original OpenDuet runtime is still being migrated from CopilotKit Intelligence to managed OpenAI Agents execution. A source-backed screen is not proof that the provider transition passed.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            #endif
        }
        .navigationTitle("More")
    }
}
