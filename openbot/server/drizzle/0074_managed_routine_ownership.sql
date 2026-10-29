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
