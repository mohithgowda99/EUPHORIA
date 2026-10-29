-- Default deny on every Bot. Only its source owner can authorize a hosted
-- network-disabled sandbox or bounded OpenAI-managed subagent delegation.
-- No credentials, provider histories, tool outputs or files are stored here.
CREATE TABLE IF NOT EXISTS "managed_bot_hosted_capabilities" (
 "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "bot_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
 "sandbox" boolean NOT NULL DEFAULT false,
 "delegation" boolean NOT NULL DEFAULT false,
 "max_concurrent_subagents" integer NOT NULL DEFAULT 1,
 "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
 PRIMARY KEY ("owner_user_id","bot_id"),
 CONSTRAINT "managed_bot_subagent_bounds" CHECK (
    "max_concurrent_subagents" BETWEEN 1 AND 3
    AND ("delegation" OR "max_concurrent_subagents"=1)
 )
);
