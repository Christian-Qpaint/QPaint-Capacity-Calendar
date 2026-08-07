ALTER TABLE "crm_deal_stage_history" ADD COLUMN IF NOT EXISTS "job_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "stage_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "fields" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deal_stage_history_job_idx" ON "crm_deal_stage_history" ("job_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_stage_id_crm_stages_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "crm_stages"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_exactly_one_owner" CHECK (("deal_id" is not null and "job_id" is null) or ("deal_id" is null and "job_id" is not null));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
