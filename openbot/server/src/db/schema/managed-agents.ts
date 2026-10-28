import { pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { agents, channels, users } from "./core";

/**
 * Provider session identity associated with one original source conversation and
 * one original Bot. This is only a foreign-key association into managed OpenAI
 * state, NOT a second conversation/task store.
 *
 * A NULL providerSessionId means session creation may have been attempted.
 * Such a link must NEVER trigger another create automatically, because a
 * failed HTTP reply cannot prove the upstream session was not created.
 */
export const managedAgentSessionLinks = pgTable(
  "managed_agent_session_links",
  {
    ownerUserId: text("owner_user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    botId: text("bot_id").notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sourceThreadId: text("source_thread_id").notNull(),
    providerSessionId: text("provider_session_id"),
    creationKey: text("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.channelId, table.botId] }),
    uniqueIndex("managed_agent_session_links_provider_idx").on(table.providerSessionId),
  ],
);
