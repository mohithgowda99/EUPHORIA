import SwiftUI
import SwiftData
import UIKit
import UserNotifications

/// A native APNs token registers only with the original authenticated
/// OpenDuet DeliveryStore. No provider key, team secret or token is compiled
/// into the app. Simulator push support does not prove device delivery.
final class EuphoriaPushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private static let deviceIDKey = "euphoria.apns.device-id"
    static let statusKey = "euphoria.apns.registration-status"

    static func stableDeviceID() -> UUID {
        if let saved = UserDefaults.standard.string(forKey: deviceIDKey),
           let uuid = UUID(uuidString: saved) { return uuid }
        let uuid = UUID()
        UserDefaults.standard.set(uuid.uuidString, forKey: deviceIDKey)
        return uuid
    }

    @MainActor
    static func requestPermissionAndRegister() async throws -> Bool {
        let granted = try await UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound])
        guard granted else {
            UserDefaults.standard.set("Notifications denied in iOS Settings.", forKey: statusKey)
            return false
        }
        UIApplication.shared.registerForRemoteNotifications()
        UserDefaults.standard.set("Waiting for an APNs device token.", forKey: statusKey)
        return true
    }

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard deviceToken.count == 32 else {
            UserDefaults.standard.set("Unexpected APNs token length.", forKey: Self.statusKey)
            return
        }
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        let deviceID = Self.stableDeviceID()
        Task {
            do {
                let client = try SavedOpenDuetAccount.client()
                try await client.registerNativePush(token: token, deviceID: deviceID)
                UserDefaults.standard.set("Registered with OpenDuet's delivery service.", forKey: Self.statusKey)
            } catch {
                // A token can arrive before authentication; retry by enabling
                // notifications again after signing in. Never log raw tokens.
                UserDefaults.standard.set(
                    "APNs token obtained, but server registration is pending. Check sign-in and server push configuration.",
                    forKey: Self.statusKey)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        UserDefaults.standard.set("iOS could not register this device with APNs.", forKey: Self.statusKey)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void) {
        // Navigation stays inside SwiftUI. Never use an untrusted remote URL.
        let kind = response.notification.request.content.userInfo["kind"] as? String
        guard kind == "approval" || kind == "question" || kind == "reply" else {
            completionHandler()
            return
        }
        NotificationCenter.default.post(name: .euphoriaPushOpened, object: nil,
            userInfo: ["kind": kind!])
        completionHandler()
    }
}

extension Notification.Name {
    static let euphoriaPushOpened = Notification.Name("euphoria.push.opened")
}

@main
struct EuphoriaApp: App {
    @UIApplicationDelegateAdaptor(EuphoriaPushDelegate.self) private var pushDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [VisualSnapshot.self, ConversationSnapshot.self,
            TaskCreationSnapshot.self, SourceMessageIntent.self, SourceTaskCreationIntent.self])
    }
}
