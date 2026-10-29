-- Existing Bun SQL + Drizzle jsonb() could persist a JSON string containing
-- the completed projection instead of a JSON object. Convert those rows only.
-- The production migration runner wraps this in an advisory-locked transaction.
-- An unexpected scalar or invalid embedded JSON is a hard failure, not data loss.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "managed_agent_inbox_turns"
    WHERE "completed_output" IS NOT NULL
      AND jsonb_typeof("completed_output") NOT IN ('object', 'string')
  ) THEN
    RAISE EXCEPTION 'managed completed_output contains unsupported JSONB shape; backup and inspect before migrating';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "managed_agent_inbox_turns"
SET "completed_output" = ("completed_output" #>> '{}')::jsonb
WHERE jsonb_typeof("completed_output") = 'string';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "managed_agent_inbox_turns"
    WHERE "completed_output" IS NOT NULL
      AND jsonb_typeof("completed_output") <> 'object'
  ) THEN
    RAISE EXCEPTION 'managed completed_output normalization did not produce JSON objects';
  END IF;
END $$;
