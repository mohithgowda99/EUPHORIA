import Foundation
import A2UISwiftCore
import VisualRuntimeCore

/// SPIKE ONLY. Converts an already validated EUPHORIA A2UIDocument snapshot
/// into standard A2UI v0.9 messages, without translating away standard props.
/// No persistence, tool dispatch, network requests, or authority is added.
///
/// The live integration must consume gateway-admitted messages directly and
/// must NOT make A2UI-Swift's in-memory model a second authoritative store.
public enum A2UIProjectionBridge {
    public static func messages(from document: A2UIDocument) throws -> [A2uiMessage] {
        try document.validate()
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()
        let raw = try decoder.decode([RawComponent].self, from: encoder.encode(document.components))
        let data = try decoder.decode(AnyCodable.self, from: encoder.encode(document.dataModel))
        var result: [A2uiMessage] = [
            .createSurface(CreateSurfacePayload(surfaceId: document.surfaceId,
                                                catalogId: document.catalogId)),
            .updateComponents(UpdateComponentsPayload(surfaceId: document.surfaceId,
                                                      components: raw)),
            .updateDataModel(UpdateDataModelPayload(surfaceId: document.surfaceId,
                                                    path: "/", value: data))
        ]

        // Replay only existing canonical local drafts. They remain in SwiftData
        // and the gateway validates every eventual user action independently.
        for path in document.localEdits.keys.sorted() {
            guard let draft = document.localEdits[path] else { continue }
            let value = try decoder.decode(AnyCodable.self, from: encoder.encode(draft))
            result.append(.updateDataModel(UpdateDataModelPayload(
                surfaceId: document.surfaceId, path: path, value: value)))
        }
        return result
    }

    public static func deletion(surfaceID: String) -> A2uiMessage {
        .deleteSurface(DeleteSurfacePayload(surfaceId: surfaceID))
    }
}
