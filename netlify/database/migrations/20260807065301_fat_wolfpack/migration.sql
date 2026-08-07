ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "rot_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "crm_stages" SET "rot_disabled" = true
WHERE "pipeline_id" IN (SELECT "id" FROM "crm_pipelines" WHERE "pipedrive_pipeline_id" = 3)
AND regexp_replace("name", '^[0-9]+\.\s*', '') IN ('Booked', 'In Progress', 'Completed', 'On Hold', 'All Done & Paid');