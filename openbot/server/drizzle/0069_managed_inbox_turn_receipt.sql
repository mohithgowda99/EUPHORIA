-- Per-original-delivery managed turn correlation. Must be populated exclusively
-- from an authenticated provider stream after original delivery admission.
CREATE TABLE "managed_agent_inbox_turns" (
  "inbox_id" text PRIMARY KEY NOT NULL REFERENCES "delivery_inbox"("id") ON DELETE CASCADE,
  "provider_session_id" text NOT NULL,
  "root_turn_id" text,
  "created_event_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_agent_inbox_turns_root_idx"
  ON "managed_agent_inbox_turns" ("provider_session_id", "root_turn_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_agent_inbox_turns_event_idx"
  ON "managed_agent_inbox_turns" ("created_event_id");
