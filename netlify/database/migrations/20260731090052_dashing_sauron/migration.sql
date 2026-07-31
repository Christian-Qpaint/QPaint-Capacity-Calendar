ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "rot_yellow_days" integer;
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "rot_orange_days" integer;
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "rot_red_days" integer;
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "auto_hide_after_days" integer;

-- FK constraints declared inline (not as separate ALTER TABLE ADD CONSTRAINT statements) so the
-- whole table creation stays a single idempotent CREATE TABLE IF NOT EXISTS — Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, and this table has no legacy rows to preserve if it needs recreating.
CREATE TABLE IF NOT EXISTS "crm_deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"deal_id" uuid NOT NULL REFERENCES "crm_deals"("id") ON DELETE CASCADE,
	"stage_id" uuid NOT NULL REFERENCES "crm_stages"("id") ON DELETE CASCADE,
	"entered_at" timestamp with time zone NOT NULL,
	"exited_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "crm_deal_stage_history_deal_idx" ON "crm_deal_stage_history" ("deal_id");
CREATE INDEX IF NOT EXISTS "crm_deal_stage_history_stage_idx" ON "crm_deal_stage_history" ("stage_id");

-- Seed the specific per-stage rotting thresholds requested for this week's update. Any stage not
-- listed here (Business Development, Test Pipeline, or any future stage) falls back to the
-- generic 7/14/21 default in CrmBoard.tsx rather than being seeded — this list only covers the
-- two pipelines with actually-specified numbers.

-- Jobs Pipeline (pipedrive pipeline 3): Admin/Ready to Schedule get orange+red, the rest red-only.
UPDATE "crm_stages" SET "rot_orange_days" = 7, "rot_red_days" = 14 WHERE "pipedrive_stage_id" = 25; -- Admin
UPDATE "crm_stages" SET "rot_orange_days" = 7, "rot_red_days" = 14 WHERE "pipedrive_stage_id" = 26; -- Ready to Schedule
UPDATE "crm_stages" SET "rot_red_days" = 14 WHERE "pipedrive_stage_id" = 27; -- Booked
UPDATE "crm_stages" SET "rot_red_days" = 21 WHERE "pipedrive_stage_id" = 28; -- In Progress
UPDATE "crm_stages" SET "rot_red_days" = 90 WHERE "pipedrive_stage_id" = 29; -- Completed
UPDATE "crm_stages" SET "rot_red_days" = 90 WHERE "pipedrive_stage_id" = 38; -- On Hold
UPDATE "crm_stages" SET "rot_red_days" = 90, "auto_hide_after_days" = 180 WHERE "pipedrive_stage_id" = 45; -- All Done & Paid

-- Sales Pipeline (pipedrive pipeline 2): red only, no orange/yellow tier.
UPDATE "crm_stages" SET "rot_red_days" = 3 WHERE "pipedrive_stage_id" = 18; -- Lead Received
UPDATE "crm_stages" SET "rot_red_days" = 3 WHERE "pipedrive_stage_id" = 20; -- Contact Qualified
UPDATE "crm_stages" SET "rot_red_days" = 7 WHERE "pipedrive_stage_id" = 21; -- Site Visit Booked
UPDATE "crm_stages" SET "rot_red_days" = 3 WHERE "pipedrive_stage_id" = 46; -- Site Visit Completed
UPDATE "crm_stages" SET "rot_red_days" = 3 WHERE "pipedrive_stage_id" = 24; -- Quote Review
UPDATE "crm_stages" SET "rot_red_days" = 60 WHERE "pipedrive_stage_id" = 23; -- Quote Sent

-- Backfill one open (exited_at null) history row per existing deal, using its current stage and
-- stageEnteredAt — past stage-to-stage history before this feature shipped was never tracked and
-- can't be recovered, so this is the earliest point real dwell-time history starts accumulating.
INSERT INTO "crm_deal_stage_history" ("deal_id", "stage_id", "entered_at")
SELECT "id", "stage_id", "stage_entered_at" FROM "crm_deals"
WHERE NOT EXISTS (SELECT 1 FROM "crm_deal_stage_history" WHERE "crm_deal_stage_history"."deal_id" = "crm_deals"."id");
