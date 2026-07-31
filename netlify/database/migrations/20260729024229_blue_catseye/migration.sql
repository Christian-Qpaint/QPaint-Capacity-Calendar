CREATE TABLE IF NOT EXISTS "crm_saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pipedrive_filter_id" integer UNIQUE,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb NOT NULL,
	"supported" boolean DEFAULT true NOT NULL,
	"unsupported_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
