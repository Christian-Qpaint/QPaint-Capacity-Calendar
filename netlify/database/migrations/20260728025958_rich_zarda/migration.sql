DO $$ BEGIN
  CREATE TYPE "crm_deal_status" AS ENUM('open', 'won', 'lost');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "crm_field_type" AS ENUM('text', 'number', 'date', 'boolean', 'select', 'multiselect', 'address', 'monetary');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "job_category" ADD VALUE IF NOT EXISTS 'QPaint';--> statement-breakpoint
ALTER TYPE "job_category" ADD VALUE IF NOT EXISTS 'Work Projects';--> statement-breakpoint
ALTER TYPE "job_category" ADD VALUE IF NOT EXISTS 'Other';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"value" numeric DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"status" "crm_deal_status" DEFAULT 'open'::"crm_deal_status" NOT NULL,
	"pipedrive_deal_id" text UNIQUE,
	"org_name" text,
	"person_name" text,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"job_id" uuid,
	"fields" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL UNIQUE,
	"label" text NOT NULL,
	"field_type" "crm_field_type" NOT NULL,
	"options" jsonb,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pipedrive_pipeline_id" integer UNIQUE,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pipeline_id" uuid NOT NULL,
	"pipedrive_stage_id" integer UNIQUE,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_won_stage" boolean DEFAULT false NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deals_pipeline_stage_idx" ON "crm_deals" ("pipeline_id","stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deals_status_idx" ON "crm_deals" ("status");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_id_crm_pipelines_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "crm_pipelines"("id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_stages_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "crm_stages"("id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_pipeline_id_crm_pipelines_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
