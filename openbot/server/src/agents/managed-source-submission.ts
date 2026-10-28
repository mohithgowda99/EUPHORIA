import type { ManagedSourceScope } from "./managed-session-links";

/**
 * Narrow managed Agents submission seam used by original source delivery.
 * The source DeliveryStore still owns the inbox idempotency/lease/outcome,
 * and original AgentProfileStore is checked before calling this function.
 * This helper sends only a provider request, never claims a turn finished.
 *
 * The real Agents API transport can be the existing gateway/AgentsClient.
 * Deliberately no duplicate provider event journal, scheduler or runner.
 */
export async function submitManagedSourceInput(input: {
  scope: ManagedSourceScope;
  runId: string;
  message: string;
  definition: { model: string; instructions: string; tools: [] };
  links: {
    reserve(scope: ManagedSourceScope, key: string): Promise<
      { create: true; providerSessionId: null } |
      { create: false; providerSessionId: string }
    >;
    bind(scope: ManagedSourceScope, key: string, sessionID: string): Promise<string>;
  };
  /** Original Inbox's immutable, source-owned receipt. Never resend a
   * possibly accepted provider input after a worker crash or lease expiry.
   */
  turns: {
    read(inboxId:string):Promise<{providerSessionId:string}|null>;
    reserve(inboxId:string, scope:{
      ownerUserId:string; channelId:string; agentId:string; threadId:string;
    },sessionID:string):Promise<"reserved"|"existing">;
  };
  provider: {
    createSession(
      initial: { model: string; instructions: string; tools: []; input: string },
      key: string,
    ): Promise<{ id?: string }>;
    sendMessage(sessionID: string, message: string, key: string): Promise<unknown>;
  };
}): Promise<{ sessionID: string; phase: "accepted" }> {
  if (!input.message.trim() || input.message.length > 16_000 ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.runId)) {
    throw new Error("Invalid original source delivery request");
  }
  const originalScope = {
    ownerUserId: input.scope.ownerUserId, channelId: input.scope.channelId,
    agentId: input.scope.botId, threadId: input.scope.threadId,
  };
  const creationKey = "source_create_" + input.runId;
  // Same original inbox on a second worker must not turn an initial create
  // into a second provider follow-up. Return ONLY provider-accepted, never done.
  const previous = await input.turns.read(input.runId);
  if (previous) {
    const linked = await input.links.reserve(input.scope, creationKey);
    if (linked.create || linked.providerSessionId !== previous.providerSessionId)
      throw new Error("Original Inbox/provider session correlation changed");
    const result = await input.turns.reserve(input.runId, originalScope, previous.providerSessionId);
    if (result !== "existing") throw new Error("Original managed receipt unexpectedly disappeared");
    return {sessionID:previous.providerSessionId,phase:"accepted"};
  }
  const link = await input.links.reserve(input.scope, creationKey);
  if (link.create) {
    // The reservation precedes the network call. If that call times out,
    // future processing is blocked until a human/provider reconciliation,
    // rather than inventing another hosted agent session.
    const session = await input.provider.createSession({
      ...input.definition,
      input: input.message,
    }, creationKey);
    if (!session?.id ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(session.id)) {
      throw new Error("Managed session outcome unknown; reconciliation required");
    }
    await input.links.bind(input.scope, creationKey, session.id);
    await input.turns.reserve(input.runId, originalScope, session.id);
    return { sessionID: session.id, phase: "accepted" };
  }
  // Each original DeliveryStore inbox row has a distinct immutable runId.
  // The Agents session continues its own context; old Chat history is not
  // repackaged as a competing local context window.
  // Claim before POST. Unknown replies remain blocked, not automatically
  // replayed. An "existing" receipt means another worker might have sent it.
  const reserved = await input.turns.reserve(input.runId, originalScope, link.providerSessionId);
  if (reserved === "reserved") {
    await input.provider.sendMessage(
      link.providerSessionId, input.message, "source_input_" + input.runId,
    );
  }
  return { sessionID: link.providerSessionId, phase: "accepted" };
}
