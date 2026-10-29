-- Section 2 recovery cursors are additive; existing routine ownership never changes.
ALTER TABLE "routines" ADD COLUMN "provider_invocation_cursor" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "provider_last_scanned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "routines_managed_fair_scan_idx"
 ON "routines" ("execution_backend","provider_last_scanned_at","id");--> statement-breakpoint
ALTER TABLE "managed_routine_webhook_receipts" ADD COLUMN "routine_cursor" text;--> statement-breakpoint
ALTER TABLE "managed_routine_webhook_receipts" ADD COLUMN "inspected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "managed_routine_webhook_pending_idx"
 ON "managed_routine_webhook_receipts" ("received_at","webhook_id")
 WHERE "inspected_at" IS NULL;
