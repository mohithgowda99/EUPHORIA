-- Persist only original OpenDuet owner/channel/Bot -> managed Agents session identity.
-- The Agents API retains execution and message history; no duplicate local runner.
CREATE TABLE "managed_agent_session_links" (
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel_id" text NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "source_thread_id" text NOT NULL,
  "provider_session_id" text,
  "creation_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "managed_agent_session_links_pkey" PRIMARY KEY ("owner_user_id", "channel_id", "bot_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_agent_session_links_provider_idx"
  ON "managed_agent_session_links" ("provider_session_id");
