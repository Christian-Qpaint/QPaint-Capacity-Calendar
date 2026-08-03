CREATE TABLE IF NOT EXISTS "user_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL,
	"role" "app_role" NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
