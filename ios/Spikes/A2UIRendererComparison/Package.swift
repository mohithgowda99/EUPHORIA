// swift-tools-version: 6.0
import PackageDescription

// Deliberately isolated: do NOT add this dependency to the shipping iOS app
// until source-fixture and device acceptance gates are satisfied.
let package = Package(
    name: "A2UIRendererComparison",
    platforms: [.iOS("27.0"), .macOS(.v14)],
    dependencies: [
        .package(path: "../../VisualRuntimeCore"),
        .package(url: "https://github.com/BBC6BAE9/a2ui-swift.git",
                 revision: "4af5dda15dd050e091a80026b940cd41f8d5b93c")
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
