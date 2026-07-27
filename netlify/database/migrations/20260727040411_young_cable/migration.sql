CREATE TYPE "app_role" AS ENUM('owner', 'ops_manager', 'scheduler_pm', 'team_leader_foreperson', 'painter_crew_member', 'marketing');--> statement-breakpoint
CREATE TYPE "client_type" AS ENUM('Individual', 'Company', 'Government', 'Body Corporate');--> statement-breakpoint
CREATE TYPE "credential_job_type_scope" AS ENUM('All', 'Residential', 'Government', 'Corporate', 'Commercial');--> statement-breakpoint
CREATE TYPE "credential_type" AS ENUM('Licence', 'Insurance', 'White Card', 'Blue Card', 'Police Check', 'WHS Induction', 'Driver Licence', 'Other', 'WorkCover', 'Public Liability');--> statement-breakpoint
CREATE TYPE "job_category" AS ENUM('Residential', 'Government', 'Corporate', 'Commercial');--> statement-breakpoint
CREATE TYPE "membership_type" AS ENUM('Core', 'Floating');--> statement-breakpoint
CREATE TYPE "schedule_block_status" AS ENUM('Unscheduled', 'Scheduled', 'In Production', 'Overdue', 'Completed');--> statement-breakpoint
CREATE TYPE "team_type" AS ENUM('QPaint', 'Contractor');--> statement-breakpoint
CREATE TYPE "work_area" AS ENUM('External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks');--> statement-breakpoint
CREATE TYPE "worker_type" AS ENUM('Internal', 'Contractor');--> statement-breakpoint
CREATE TABLE "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"month" date NOT NULL,
	"referral_source" text NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_spend_month_referral_source_key" UNIQUE("month","referral_source")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"type" "client_type" NOT NULL,
	"contact_info" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"reported_monthly_capacity" numeric DEFAULT '0' NOT NULL,
	"trading_name" text,
	"abn" text,
	"acn" text,
	"gst_registered" boolean,
	"licence_category" text,
	"address" text,
	"suburb" text,
	"state" text,
	"postcode" text,
	"primary_contact_name" text,
	"primary_contact_mobile" text,
	"primary_contact_email" text,
	"preferred_area" text,
	"after_hours_available" text,
	"own_equipment" text,
	"own_transport" text,
	"years_experience" integer,
	"reference_1_name" text,
	"reference_1_phone" text,
	"reference_2_name" text,
	"reference_2_phone" text,
	"approved" text,
	"active" text,
	"last_updated" date,
	"nickname" text
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"contractor_id" uuid NOT NULL,
	"credential_type" "credential_type" NOT NULL,
	"number" text,
	"issuer" text,
	"coverage_amount" numeric,
	"expiry_date" date,
	"job_type_scope" "credential_job_type_scope"
);
--> statement-breakpoint
CREATE TABLE "daily_hours_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"schedule_block_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"entered_by_user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" numeric NOT NULL,
	CONSTRAINT "daily_hours_entries_hours_check" CHECK ("hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pipedrive_deal_id" text NOT NULL UNIQUE,
	"client_id" uuid NOT NULL,
	"address" text NOT NULL,
	"category" "job_category" NOT NULL,
	"total_value" numeric DEFAULT '0' NOT NULL,
	"target_hours" numeric NOT NULL,
	"date_won" date NOT NULL,
	"pipedrive_stage_id" integer,
	"pipedrive_deal_title" text,
	"actual_hours_override" numeric,
	"actual_hours_source" text DEFAULT 'computed' NOT NULL,
	"production_percent_override" numeric,
	"production_percent_source" text DEFAULT 'computed' NOT NULL,
	CONSTRAINT "jobs_actual_hours_source_check" CHECK ("actual_hours_source" in ('computed', 'manual')),
	CONSTRAINT "jobs_production_percent_source_check" CHECK ("production_percent_source" in ('computed', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "marketing_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"external_id" text UNIQUE,
	"title" text,
	"referral_source" text DEFAULT 'Other' NOT NULL,
	"salesperson" text,
	"raw_stage" text,
	"is_quoted" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"value" numeric DEFAULT '0' NOT NULL,
	"created_date" date NOT NULL,
	"event_date" date,
	"import_batch_id" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline" text,
	"lost_reason" text,
	"expected_close_date" date,
	"import_source" text
);
--> statement-breakpoint
CREATE TABLE "monthly_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"target_dollars" numeric NOT NULL,
	"actual_dollars" numeric NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_by" uuid,
	CONSTRAINT "monthly_snapshots_year_month_key" UNIQUE("year","month"),
	CONSTRAINT "monthly_snapshots_month_check" CHECK ("month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "monthly_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"target_dollars" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_targets_year_month_key" UNIQUE("year","month"),
	CONSTRAINT "monthly_targets_month_check" CHECK ("month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipient_id" uuid NOT NULL,
	"type" text DEFAULT 'access_request' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"job_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"work_area" "work_area" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"phase_hours" numeric NOT NULL,
	"status" "schedule_block_status" DEFAULT 'Scheduled'::"schedule_block_status" NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"percent_complete_updated_by" text,
	"percent_complete_updated_at" date,
	"notes" text,
	CONSTRAINT "schedule_blocks_percent_complete_check" CHECK ("percent_complete" between 0 and 100),
	CONSTRAINT "schedule_blocks_date_order" CHECK ("end_date" >= "start_date")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"worker_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"membership_type" "membership_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"type" "team_type" NOT NULL,
	"contractor_id" uuid,
	"headcount" integer,
	"standard_hours_per_week" numeric,
	"color" text,
	CONSTRAINT "teams_contractor_shape" CHECK (("type" = 'QPaint' and "contractor_id" is null) or ("type" = 'Contractor' and "contractor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"granted" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "app_role" DEFAULT 'painter_crew_member'::"app_role" NOT NULL,
	"team_id" uuid,
	"worker_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"job_id" uuid NOT NULL,
	"week_ending" date NOT NULL,
	"actual_hours" numeric NOT NULL,
	CONSTRAINT "weekly_actuals_job_id_week_ending_key" UNIQUE("job_id","week_ending")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"worker_type" "worker_type" NOT NULL,
	"contractor_id" uuid,
	"white_card_number" text DEFAULT '' NOT NULL,
	"qbuild_induction_done" boolean DEFAULT false NOT NULL,
	"qbuild_induction_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workers_contractor_shape" CHECK (("worker_type" = 'Internal' and "contractor_id" is null) or ("worker_type" = 'Contractor' and "contractor_id" is not null))
);
--> statement-breakpoint
CREATE INDEX "marketing_deals_import_batch_idx" ON "marketing_deals" ("import_batch_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" ("recipient_id","read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_key_key" ON "user_permission_overrides" ("user_id","permission_key");--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_contractor_id_contractors_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "daily_hours_entries" ADD CONSTRAINT "daily_hours_entries_schedule_block_id_schedule_blocks_id_fkey" FOREIGN KEY ("schedule_block_id") REFERENCES "schedule_blocks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "daily_hours_entries" ADD CONSTRAINT "daily_hours_entries_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "daily_hours_entries" ADD CONSTRAINT "daily_hours_entries_entered_by_user_id_users_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_captured_by_users_id_fkey" FOREIGN KEY ("captured_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_worker_id_workers_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_contractor_id_contractors_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_worker_id_workers_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "weekly_actuals" ADD CONSTRAINT "weekly_actuals_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_contractor_id_contractors_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE;