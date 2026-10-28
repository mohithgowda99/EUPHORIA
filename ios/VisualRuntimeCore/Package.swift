// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VisualRuntimeCore",
    platforms: [.iOS("27.0")],
    products: [.library(name: "VisualRuntimeCore", targets: ["VisualRuntimeCore"])],
    targets: [
        .target(name: "VisualRuntimeCore", resources: [.process("Fixtures")]),
        .testTarget(name: "VisualRuntimeCoreTests", dependencies: ["VisualRuntimeCore"]),
    ]
)
