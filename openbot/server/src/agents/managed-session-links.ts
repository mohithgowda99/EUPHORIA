import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { managedAgentSessionLinks } from "../db/schema";

/**
 * The only custom persistent state required to relate ORIGINAL OpenDuet
 * channel/Bot/user identity to an OpenAI-hosted session. It stores no copied
 * messages, tasks, turns, memory, execution events or action outcomes.
 */
export type ManagedSourceScope = {
  ownerUserId: string;
  channelId: string;
  botId: string;
  threadId: string;
};

export class UncertainManagedSession extends Error {
  constructor() {
    super("Managed session creation may have started; reconcile before any new provider write");
    this.name = "UncertainManagedSession";
  }
}
export class ManagedSessionIdentityConflict extends Error {
  constructor() {
    super("Original Bot or thread identity changed; provider session cannot be reused");
    this.name = "ManagedSessionIdentityConflict";
  }
}

export function createManagedSessionLinkStore(database: Database) {
  const byOwner = (scope: ManagedSourceScope) =>
    and(
      eq(managedAgentSessionLinks.ownerUserId, scope.ownerUserId),
      eq(managedAgentSessionLinks.channelId, scope.channelId),
      eq(managedAgentSessionLinks.botId, scope.botId),
    );

  const read = async (scope: ManagedSourceScope) => {
    const [link] = await database.select().from(managedAgentSessionLinks)
      .where(byOwner(scope)).limit(1);
    if (link && link.sourceThreadId !== scope.threadId) {
      throw new ManagedSessionIdentityConflict();
    }
    return link ?? null;
  };

  return {
    read,
    /**
     * One row is reserved BEFORE session.create. Only the winning caller is
     * allowed to call OpenAI. Losers never repeat a possibly delivered write.
     * The caller must pass a stable queue-delivery identity as creationKey.
     */
    async reserve(scope: ManagedSourceScope, creationKey: string):
      Promise<{ create: true; providerSessionId: null } |
        { create: false; providerSessionId: string; creationKey: string }> {
      if (!creationKey || creationKey.length > 256) {
        throw new ManagedSessionIdentityConflict();
      }
      return database.transaction(async tx => {
        // Serialise the ORIGINAL permission row with the FIRST provider
        // reservation, even across two backend processes.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.ownerUserId+":"+scope.botId}, 0))`);
        const [created] = await tx.insert(managedAgentSessionLinks).values({
          ownerUserId: scope.ownerUserId,
          channelId: scope.channelId,
          botId: scope.botId,
          sourceThreadId: scope.threadId,
          creationKey,
        }).onConflictDoNothing().returning();
        if (created) return { create: true as const, providerSessionId: null };
        const [previous] = await tx.select().from(managedAgentSessionLinks)
          .where(byOwner(scope)).limit(1);
        if (!previous || previous.sourceThreadId !== scope.threadId)
          throw new ManagedSessionIdentityConflict();
        if (!previous.providerSessionId) throw new UncertainManagedSession();
        return { create: false as const, providerSessionId: previous.providerSessionId,
          creationKey: previous.creationKey };
      });
    },
    /**
     * Link only the session created under this exact immutable reservation.
     * A foreign session ID or a concurrent replacement cannot overwrite it.
     */
    async bind(scope: ManagedSourceScope, creationKey: string, sessionID: string) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionID))
        throw new ManagedSessionIdentityConflict();
      const [linked] = await database.update(managedAgentSessionLinks)
        .set({ providerSessionId: sessionID, updatedAt: new Date() })
        .where(and(byOwner(scope),
          eq(managedAgentSessionLinks.sourceThreadId, scope.threadId),
          eq(managedAgentSessionLinks.creationKey, creationKey),
          isNull(managedAgentSessionLinks.providerSessionId)))
        .returning();
      if (linked) return sessionID;
      const existing = await read(scope);
      if (existing?.creationKey === creationKey && existing.providerSessionId === sessionID)
        return sessionID;
      throw new ManagedSessionIdentityConflict();
    },
  };
}
