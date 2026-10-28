import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { deliveryInbox, managedAgentInboxTurns } from "../db/schema";
import type { DeliveryScope } from "../delivery/types";
import type { ManagedSourceScope } from "./managed-session-links";

const valid = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);

/** Immutable source-owned correlation, NOT an execution journal or runner.
 *
 * The caller must observe agent.session.turn.created from the authenticated
 * stream opened BEFORE the matching provider input, without other inputs
 * racing in that session. Never infer a root turn from the last item or from
 * session.idle. A lost event leaves the Inbox unresolved, not falsely done.
 */
export function createManagedInboxTurnStore(database: Database, links: {
  read(scope: ManagedSourceScope): Promise<{
    providerSessionId: string | null; sourceThreadId: string;
  } | null>;
}) {
  async function original(inboxId: string, scope: DeliveryScope) {
    if (!valid(inboxId) || !valid(scope.ownerUserId) || !valid(scope.channelId) ||
        !valid(scope.agentId) || !valid(scope.threadId))
      throw new Error("Invalid original delivery identity");
    const [row] = await database.select().from(deliveryInbox)
      .where(eq(deliveryInbox.id,inboxId)).limit(1);
    if (!row || row.ownerUserId !== scope.ownerUserId ||
        row.channelId !== scope.channelId || row.agentId !== scope.agentId ||
        row.threadId !== scope.threadId || !["running","accepted"].includes(row.state))
      throw new Error("Original Inbox is unavailable for managed correlation");
    return row;
  }
  async function providerOwned(scope: DeliveryScope, sessionID: string) {
    if (!valid(sessionID)) throw new Error("Invalid managed session identity");
    const link = await links.read({
      ownerUserId:scope.ownerUserId, channelId:scope.channelId,
      botId:scope.agentId, threadId:scope.threadId,
    });
    if (link?.providerSessionId !== sessionID || link.sourceThreadId !== scope.threadId)
      throw new Error("Managed session is not owned by original source channel");
  }
  return {
    async reserve(inboxId: string, scope: DeliveryScope, sessionID: string) {
      await original(inboxId,scope);
      await providerOwned(scope,sessionID);
      const [inserted] = await database.insert(managedAgentInboxTurns)
        .values({inboxId,providerSessionId:sessionID})
        .onConflictDoNothing().returning();
      if (inserted) return;
      const [existing] = await database.select().from(managedAgentInboxTurns)
        .where(eq(managedAgentInboxTurns.inboxId,inboxId)).limit(1);
      if (existing?.providerSessionId !== sessionID)
        throw new Error("Original Inbox cannot switch managed sessions");
    },
    /** Only the initial root-created event can establish this exact
     * correlation. It must never be supplied from iOS or a tool parameter.
     */
    async bindRootCreatedEvent(input: {
      inboxId:string; scope:DeliveryScope; sessionID:string;
      event: {
        type:string; event_id:string; session_id:string; turn_id:string;
        turn:{id:string;session_id:string;subagent_id:string|null};
      };
    }) {
      await original(input.inboxId,input.scope);
      await providerOwned(input.scope,input.sessionID);
      const event=input.event;
      if (event.type !== "agent.session.turn.created" ||
          !valid(event.event_id) || !valid(event.turn_id) ||
          event.session_id !== input.sessionID ||
          event.turn.id !== event.turn_id ||
          event.turn.session_id !== input.sessionID ||
          event.turn.subagent_id !== null)
        throw new Error("Unverified managed root-created event");
      const [updated] = await database.update(managedAgentInboxTurns)
        .set({rootTurnId:event.turn_id, createdEventId:event.event_id})
        .where(and(eq(managedAgentInboxTurns.inboxId,input.inboxId),
          eq(managedAgentInboxTurns.providerSessionId,input.sessionID),
          isNull(managedAgentInboxTurns.rootTurnId)))
        .returning();
      if (updated) return event.turn_id;
      const [existing] = await database.select().from(managedAgentInboxTurns)
        .where(eq(managedAgentInboxTurns.inboxId,input.inboxId)).limit(1);
      if (existing?.providerSessionId === input.sessionID &&
          existing.rootTurnId === event.turn_id &&
          existing.createdEventId === event.event_id)
        return event.turn_id;
      throw new Error("Root turn receipt is immutable or unreserved");
    },
    async turnBelongsToInbox(input: {
      scope:DeliveryScope; inboxId:string; sessionID:string; rootTurnID:string;
    }):Promise<boolean> {
      if (!valid(input.sessionID) || !valid(input.rootTurnID)) return false;
      try {
        await original(input.inboxId,input.scope);
        await providerOwned(input.scope,input.sessionID);
      } catch { return false; }
      const [saved] = await database.select().from(managedAgentInboxTurns)
        .where(eq(managedAgentInboxTurns.inboxId,input.inboxId)).limit(1);
      return saved?.providerSessionId === input.sessionID &&
        saved.rootTurnId === input.rootTurnID &&
        !!saved.createdEventId;
    },
    async read(inboxId:string) {
      if (!valid(inboxId)) throw new Error("Invalid original Inbox identity");
      return (await database.select().from(managedAgentInboxTurns)
        .where(eq(managedAgentInboxTurns.inboxId,inboxId)).limit(1))[0] ?? null;
    },
  };
}
