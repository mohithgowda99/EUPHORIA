-- Existing original routines remain source-owned; none are silently migrated.
ALTER TABLE "routines" ADD COLUMN "execution_backend" text DEFAULT 'source' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_automation_id" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_session_id" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_sync_key" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_sync_operation" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_execution_backend_check"
 CHECK ("execution_backend" IN ('source','provisioning','managed','sync_unknown'));--> statement-breakpoint
CREATE UNIQUE INDEX "routines_provider_automation_idx" ON "routines" ("provider_automation_id")
 WHERE "provider_automation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "routines_provider_owner_idx" ON "routines" ("owner_user_id","execution_backend");

CREATE TABLE "managed_routine_invocations" (
 "receipt_key" text PRIMARY KEY NOT NULL,
 "routine_id" text NOT NULL REFERENCES "routines"("id") ON DELETE cascade,
 "provider_invocation_id" text UNIQUE,
 "provider_session_id" text,
 "root_turn_id" text,
 "original_run_id" text REFERENCES "routine_runs"("id") ON DELETE set null,
 "delivery_status" text DEFAULT 'unknown' NOT NULL,
 "execution_status" text DEFAULT 'unverified' NOT NULL,
 "source" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "managed_routine_invocations_routine_idx"
 ON "managed_routine_invocations" ("routine_id","created_at");--> statement-breakpoint
CREATE TABLE "managed_routine_webhook_receipts" (
 "webhook_id" text PRIMARY KEY NOT NULL,
 "session_id" text NOT NULL,
 "event_type" text NOT NULL,
 "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
