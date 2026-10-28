# EUPHORIA: generated artifact lifecycle and security boundary

## Preserve the current implementation

OpenDuet \`lib/copilot/generative-ui.ts\` puts arbitrary generated HTML/CSS/JS inside a sandboxed iframe with no same-origin session access. EUPHORIA already has \`ios/EuphoriaApp/GeneratedArtifactView.swift\` and \`ios/VisualRuntimeCore/Sources/VisualRuntimeCore/ArtifactPolicy.swift\`: unique \`euphoria-artifact://<uuid>/index.html\` URL, ephemeral WKWebView store, restrictive CSP \`connect-src 'none'\`, no scripts-to-native handlers, denied navigation/popups/media/device access. This branch does **not** modify those files or install a new JavaScript bridge. WKWebView remains restricted to isolated generated artifacts, never the application shell or standard A2UI nodes.

## Proposed verified lifecycle (design only)

1. OpenAI Agents API proposes an artifact via a function tool call. Existing gateway checks session ownership, tool permission, content size/type and authorized publisher; it records a proposed immutable version **without claiming execution**.
2. Gateway publishes \`{artifactID,version,digest,surfaceID,ownerID,sandboxPolicyVersion,revision}\`. Device caches permitted source and revision inside existing SwiftData model.
3. WKWebView constructs a fresh isolated origin using existing ArtifactPolicy, verifies digest and loads bounded HTML/CSS/JS. The artifact has no app cookies, Keychain, native APIs, network or same-origin access.
4. **Disabled until separate security review:** future artifact actions might use only allowlisted \`artifactAction.v1\`: \`{artifactID,revision,componentID,actionID,nonce,eventName,payload}\`. This is a *request* to the existing gateway journal, never a general-purpose JS/native command or tool dispatcher.
5. Native ingress must bind exact document URL/scheme, main frame and loaded artifact instance, nonce freshness, active session/user, artifact revision, event name and bounded payload. Server authenticates ownership and authorizes each effect independently. A forged JavaScript-origin message is never proof of user consent.
6. Gateway persists an idempotent action before sending its result to the *correct* provider turn/tool call. Explicit confirmation is needed for consequential effects. Server receipt identifies actual success; no client-side replay.
7. New agent revision is published as a new immutable artifact version. Relaunch rehydrates the approved artifact and action receipts; pending/uncertain effects stay pending and are not silently resent.

## Threat-model regression gates

- A real iOS WebKit test must reject fetch/XHR/WebSocket/WebRTC, popups, iframe, form post, cross-origin redirects, camera, microphone, geolocation, files, clipboard and arbitrary native message handlers.
- A forged/stale/cross-session artifact ID, revision or nonce, replayed action ID, malformed payload, unknown event and missing authorization must fail before tool execution and produce no effect.
- Content hash after publication must match what is displayed; author/source cannot insert unvalidated network permissions, remote scripts or a new native bridge via a revised artifact.
- No outgoing action channel will be enabled from this branch. These are **design requirements, not passed integration tests**.
- No second sandbox renderer, provider abstraction, database, persistence engine or agent execution layer is introduced.
