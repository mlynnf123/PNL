ALTER TABLE "carrier_scopes" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;