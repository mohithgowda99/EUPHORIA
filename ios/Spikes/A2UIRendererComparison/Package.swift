// swift-tools-version: 6.0
import PackageDescription

// The same pinned upstream dependency is now linked into the shipping app for
// source-validated display-only surfaces. Full action conformance and device
// validation remain explicit gates. This comparison package retains its tests.
let package = Package(
    name: "A2UIRendererComparison",
    platforms: [.iOS("27.0"), .macOS(.v14)],
    dependencies: [
        .package(path: "../../VisualRuntimeCore"),
        .package(url: "https://github.com/BBC6BAE9/a2ui-swift.git",
                 revision: "16476ba2cb3fcb4c4bcb141dfa4c2804adbdedb0")
    ],
    targets: [
        .target(name: "A2UIRendererComparison", dependencies: [
            .product(name: "VisualRuntimeCore", package: "VisualRuntimeCore"),
            .product(name: "A2UISwiftCore", package: "a2ui-swift")
        ]),
        .testTarget(name: "A2UIRendererComparisonTests", dependencies: [
            "A2UIRendererComparison",
            .product(name: "VisualRuntimeCore", package: "VisualRuntimeCore"),
            .product(name: "A2UISwiftCore", package: "a2ui-swift"),
            .product(name: "A2UISwiftUI", package: "a2ui-swift")
        ])
    ]
)
