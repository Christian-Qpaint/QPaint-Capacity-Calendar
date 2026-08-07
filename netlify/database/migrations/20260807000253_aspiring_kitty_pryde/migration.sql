ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_actual_hours_source_check";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "person_phone" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "person_email" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "actual_hours" numeric;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "actual_hours_override";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "actual_hours_source";