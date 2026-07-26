CREATE TYPE "public"."contract_status" AS ENUM('draft', 'sent', 'signed', 'completed');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"customer_name" text,
	"customer_address" text,
	"customer_city" text,
	"customer_state" text,
	"customer_zip" text,
	"customer_phone" text,
	"customer_email" text,
	"company_rep_name" text,
	"company_rep_title" text,
	"project_description" text,
	"work_location" text,
	"start_date" date,
	"completion_date" date,
	"line_items_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_schedule_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signatures_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"terms" text,
	"warranty_info" text,
	"notes" text,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lead_id" uuid,
	"job_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_org_number_unique" ON "contracts" USING btree ("organization_id","contract_number");