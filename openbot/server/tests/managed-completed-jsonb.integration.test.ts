import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

/**
 * Exercise the EXACT shipped SQL against a shadow table, never an owner's
 * saved conversation. The production migration runs in one locked transaction.
 * TEST_DATABASE_URL must designate a disposable PostgreSQL database.
 */
const url = process.env.TEST_DATABASE_URL;
test.skipIf(!url)(
  "managed JSONB migration preserves legacy and native receipts",
  async () => {
    const client = postgres(url!, { max: 1, onnotice: () => {} });
    try {
      await client.begin(async (tx) => {
        // Temp-table name shadows the real table for all unqualified SQL in 0071.
        await tx.unsafe(
          'CREATE TEMP TABLE "managed_agent_inbox_turns" ("completed_output" jsonb)',
        );
        const old = {
          replyText: "Legacy answer",
          surfaces: [{ surfaceID: "call_old" }],
          selectedLabels: { call_old: "Leg day" },
        };
        const native = {
          replyText: "Current answer",
          surfaces: [],
          selectedLabels: {},
        };
        await tx.unsafe(
          'INSERT INTO "managed_agent_inbox_turns" ("completed_output") VALUES ($1::text::jsonb), ($2::text::jsonb), (NULL)',
          [JSON.stringify(JSON.stringify(old)), JSON.stringify(native)],
        );
        const seeded = await tx.unsafe<{ kind: string }[]>(
          'SELECT jsonb_typeof("completed_output") AS kind FROM "managed_agent_inbox_turns" ORDER BY "completed_output" IS NULL, "completed_output"::text',
        );
        expect(seeded.map((row) => row.kind)).toContain("string");
        expect(seeded.map((row) => row.kind)).toContain("object");
        const file = new URL(
          "../drizzle/0071_managed_completed_jsonb_normalization.sql",
          import.meta.url,
        );
        const statements = (await readFile(file, "utf8"))
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) await tx.unsafe(statement);
        // Re-running the normalization on a database already migrated is safe.
        for (const statement of statements) await tx.unsafe(statement);
        const rows = await tx.unsafe<
          { kind: string | null; projection: string | null }[]
        >(
          'SELECT jsonb_typeof("completed_output") AS kind, "completed_output"::text AS projection FROM "managed_agent_inbox_turns" ORDER BY "completed_output" IS NULL, "completed_output"->>\'replyText\'',
        );
        expect(rows.map((r) => r.kind)).toEqual(["object", "object", null]);
        const projections = rows
          .filter((r) => r.projection !== null)
          .map((r) => JSON.parse(r.projection!));
        expect(projections).toContainEqual(old);
        expect(projections).toContainEqual(native);
      });
    } finally {
      await client.end({ timeout: 5 });
    }
  },
);
