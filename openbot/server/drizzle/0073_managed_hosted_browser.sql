-- Operator-restricted OpenAI browser opt-in. Original Bot owner is still required.
ALTER TABLE "managed_bot_hosted_capabilities" ADD COLUMN IF NOT EXISTS "browser" boolean NOT NULL DEFAULT false;
