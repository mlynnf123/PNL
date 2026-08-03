ALTER TYPE "public"."production_phase" ADD VALUE 'lead_new';--> statement-breakpoint
ALTER TYPE "public"."production_phase" ADD VALUE 'contacted';--> statement-breakpoint
ALTER TYPE "public"."production_phase" ADD VALUE 'inspection';--> statement-breakpoint
ALTER TYPE "public"."production_phase" ADD VALUE 'estimate';--> statement-breakpoint
ALTER TYPE "public"."production_phase" ADD VALUE 'signed';--> statement-breakpoint
ALTER TYPE "public"."production_phase" ADD VALUE 'lost';--> statement-breakpoint
DROP INDEX "jobs_org_job_number_unique";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "job_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "property_address_line1" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "property_city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "property_state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "property_postal_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "funding_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "original_contract_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "contracted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "prospect_name" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "prospect_phone" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "prospect_email" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "prospect_address" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source" "lead_source";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "priority" "lead_priority";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "preferred_contact" "preferred_contact";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "estimated_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_contact_date" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "next_follow_up" date;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_org_job_number_unique" ON "jobs" USING btree ("organization_id","job_number") WHERE "jobs"."job_number" is not null;