ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "stage_entered_at" timestamp with time zone;
-- Backfill existing rows with the best available proxy (last touched) rather than "now" — a
-- straight `DEFAULT now() NOT NULL` in one step would stamp every pre-existing deal as having just
-- entered its stage today, hiding genuine staleness on legacy data until it next moves.
UPDATE "crm_deals" SET "stage_entered_at" = COALESCE("updated_at", "created_at") WHERE "stage_entered_at" IS NULL;
ALTER TABLE "crm_deals" ALTER COLUMN "stage_entered_at" SET DEFAULT now();
ALTER TABLE "crm_deals" ALTER COLUMN "stage_entered_at" SET NOT NULL;