import SwiftUI
import UserNotifications

/// OpenDuet's secondary product areas, grouped without changing the original
/// features or replacing them with mock pages. Every destination is native.
struct SourceMoreView: View {
    @State private var notificationStatus = UserDefaults.standard.string(forKey: EuphoriaPushDelegate.statusKey) ?? "Not enabled"
    @State private var enablingNotifications = false
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
            Section("External services") {
                NavigationLink {
                    SourceConnectionsView()
                } label: {
                    Label("Connections", systemImage: "point.3.connected.trianglepath.dotted")
                }
            }
            Section("Notifications") {
                Button {
                    enablingNotifications = true
                    Task {
                        do {
                            _ = try await EuphoriaPushDelegate.requestPermissionAndRegister()
                            notificationStatus = UserDefaults.standard.string(
                                forKey: EuphoriaPushDelegate.statusKey) ?? "Awaiting APNs"
                        } catch {
                            notificationStatus = "iOS notification permission request failed."
                        }
                        enablingNotifications = false
                    }
                } label: {
                    Label("Enable native iPhone notifications", systemImage: "bell.badge")
                }
                .disabled(enablingNotifications)
                Text(notificationStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Approval and briefing alerts use Apple's push service and your authenticated OpenDuet delivery account. A reachable server and signed APNs credentials are required.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
