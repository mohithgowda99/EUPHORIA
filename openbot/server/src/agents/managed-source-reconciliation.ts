import type { DeliveryScope } from "../delivery/types";
import type { ManagedSourceScope } from "./managed-session-links";
import { managedTurnOutcome } from "./managed-source-outcome";

/**
 * Project an already-submitted managed turn into the ORIGINAL OpenDuet source.
 *
 * Callers supply a provider-confirmed root-turn ID from the managed event
 * stream/recovery record. A session becoming "idle", HTTP 202, or an arbitrary
 * last turn cannot settle source work. The owner-scoped source inbox and
 * ManagedSessionLink must agree, and access is rechecked after remote reads.
 *
 * Original ChannelStore.recordActivity has source-id deduplication. A crash
 * after the channel write but before Inbox settlement is safe to reconcile:
 * the source ID is stable. No second channel/message store is created.
 *
 * This is a completion seam, NOT a second scheduler, provider runner or
 * approval executor. It does not interpret required_actions as approval.
 */
export async function reconcileManagedSourceInbox(input: {
  inboxId: string;
  sessionID: string;
  rootTurnID: string;
  inbox: {
    inbox(id: string): Promise<{
      id: string;
      ownerUserId: string;
      channelId: string;
      agentId: string;
      threadId: string;
      state: string;
    } | null>;
    settleAcceptedInbox(id: string, state: "sent" | "failed", reason?: string | null): Promise<boolean>;
  };
  links: {
    read(scope: ManagedSourceScope): Promise<{
      providerSessionId: string | null;
      sourceThreadId: string;
    } | null>;
  };
  provider: {
    retrieveSession(id: string): Promise<{ id?: string; status?: unknown; required_actions?: unknown[] }>;
    listTurns(id: string, options: { order: "desc"; limit: 100 }): Promise<{
      data?: { id?: string; status?: string; subagent_id?: string | null }[];
    }>;
    listItems(id: string, options: { order: "desc"; limit: 100 }): Promise<{
      data?: { type?: string; role?: string; status?: string; turn_id?: string; content?: unknown }[];
    }>;
  };
  authorise(scope: DeliveryScope): Promise<boolean>;
  botAvailable(scope: DeliveryScope): Promise<boolean>;
  recordSourceReply(scope: DeliveryScope, text: string, sourceID: string): Promise<void>;
}): Promise<"pending" | "waiting_for_human" | "completed" | "failed" | "already_settled" | "revoked"> {
  const id = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  if (!id.test(input.inboxId) || !id.test(input.sessionID) || !id.test(input.rootTurnID))
    throw new Error("Invalid managed source reconciliation identity");
  const row = await input.inbox.inbox(input.inboxId);
  if (!row || row.id !== input.inboxId) throw new Error("Original inbox not found");
  if (row.state === "sent" || row.state === "failed") return "already_settled";
  if (row.state !== "accepted") throw new Error("Original inbox has not accepted managed execution");
  const scope: DeliveryScope = {
    ownerUserId: row.ownerUserId,
    channelId: row.channelId,
    agentId: row.agentId,
    threadId: row.threadId,
  };
  const providerScope: ManagedSourceScope = {
    ownerUserId: scope.ownerUserId,
    channelId: scope.channelId,
    botId: scope.agentId,
    threadId: scope.threadId,
  };
  const link = await input.links.read(providerScope);
  if (!link || link.sourceThreadId !== scope.threadId ||
      link.providerSessionId !== input.sessionID)
    throw new Error("Managed source session is not owned by this original conversation");

  const permitted = async () => await input.authorise(scope) && await input.botAvailable(scope);
  if (!(await permitted())) return "revoked";

  // Only READ provider state; these calls never replay a model, tool or action.
  const session = await input.provider.retrieveSession(input.sessionID);
  if (session?.id !== input.sessionID) throw new Error("Managed provider session identity mismatch");
  const [turns, items] = await Promise.all([
    input.provider.listTurns(input.sessionID, {order: "desc", limit: 100}),
    input.provider.listItems(input.sessionID, {order: "desc", limit: 100}),
  ]);
  const state = managedTurnOutcome({
    sessionStatus: session.status,
    turnID: input.rootTurnID,
    turns,
    items,
    requiredActions: session.required_actions,
  });
  if (state.kind === "pending") return "pending";
  if (state.kind === "waiting_for_human") return "waiting_for_human";
  if (!(await permitted())) return "revoked";
  if (state.kind === "failed") {
    const changed = await input.inbox.settleAcceptedInbox(
      input.inboxId, "failed", "The managed agent turn " + state.reason + ".",
    );
    return changed ? "failed" : "already_settled";
  }
  if (!state.replyText.trim()) {
    // A completed tool-only turn may not carry a user-facing answer. Do not
    // invent one or declare the original person-facing delivery complete.
    return "pending";
  }
  await input.recordSourceReply(scope, state.replyText, "delivery-reply:" + input.inboxId);
  const changed = await input.inbox.settleAcceptedInbox(input.inboxId, "sent");
  return changed ? "completed" : "already_settled";
}
