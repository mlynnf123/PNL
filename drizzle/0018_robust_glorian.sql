CREATE TYPE "public"."carrier_scope_status" AS ENUM('uploaded', 'processing', 'parsed_needs_review', 'approved_mapped', 'rejected', 'parse_error');--> statement-breakpoint
CREATE TABLE "carrier_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"document_id" uuid,
	"status" "carrier_scope_status" DEFAULT 'uploaded' NOT NULL,
	"extraction_model" text,
	"extraction_mode" text,
	"extracted_at" timestamp with time zone,
	"parse_error" text,
	"raw_extraction_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"carrier" text,
	"claim_number" text,
	"insured_name" text,
	"property_address" text,
	"estimate_number" text,
	"estimate_date" date,
	"date_of_loss" date,
	"rcv" numeric(12, 2),
	"acv" numeric(12, 2),
	"recoverable_depreciation" numeric(12, 2),
	"non_recoverable_depreciation" numeric(12, 2),
	"deductible" numeric(12, 2),
	"net_claim" numeric(12, 2),
	"prior_payments" numeric(12, 2),
	"sales_tax" numeric(12, 2),
	"overhead_profit" numeric(12, 2),
	"mapped_revenue_component_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_mapped_revenue_component_id_revenue_components_id_fk" FOREIGN KEY ("mapped_revenue_component_id") REFERENCES "public"."revenue_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD CONSTRAINT "carrier_scopes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carrier_scopes_lead_idx" ON "carrier_scopes" USING btree ("lead_id");