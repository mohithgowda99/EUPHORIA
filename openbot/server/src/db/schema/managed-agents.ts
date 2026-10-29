import { pgTable, primaryKey, text, timestamp, uniqueIndex, integer, boolean } from "drizzle-orm/pg-core";
import { jsonb } from "./json";
import { agents, channels, users } from "./core";
import { deliveryInbox } from "./delivery";

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

/**
 * Exact delivery-to-provider root-turn correlation; one immutable receipt
 * per ORIGINAL delivery inbox row. This is NOT another conversation journal.
 * Neither an idle session nor a later root turn can impersonate the message.
 */
export const managedAgentInboxTurns = pgTable(
  "managed_agent_inbox_turns",
  {
    inboxId: text("inbox_id").primaryKey()
      .references(() => deliveryInbox.id, { onDelete: "cascade" }),
    providerSessionId: text("provider_session_id").notNull(),
    rootTurnId: text("root_turn_id"),
    createdEventId: text("created_event_id"),
    // Validated completed-root presentation, owned by this original Inbox receipt.
    // Provider reads are for reconciliation, never required to reopen saved work.
    completedOutput: jsonb("completed_output").$type<{replyText:string;surfaces:unknown[];selectedLabels?:Record<string,string>}>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("managed_agent_inbox_turns_root_idx").on(
      table.providerSessionId, table.rootTurnId),
    uniqueIndex("managed_agent_inbox_turns_event_idx").on(table.createdEventId),
  ],
);

/** Per-source-owner capabilities, NEVER an executable agent or authority
 * delegated to an untrusted generated interface. Missing row = all disabled.
 */
export const managedBotHostedCapabilities=pgTable("managed_bot_hosted_capabilities",{
 ownerUserId:text("owner_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
 botId:text("bot_id").notNull().references(()=>agents.id,{onDelete:"cascade"}),
 sandbox:boolean("sandbox").notNull().default(false),
 webSearch:boolean("web_search").notNull().default(false),
 delegation:boolean("delegation").notNull().default(false),
 maxConcurrentSubagents:integer("max_concurrent_subagents").notNull().default(1),
 updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[primaryKey({columns:[table.ownerUserId,table.botId]})]);
