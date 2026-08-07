ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "pipedrive_update_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "next_activity_date" date;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "activities_count" integer;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "stage_change_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "expected_close_date" date;
