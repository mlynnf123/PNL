CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"estimate_number" integer NOT NULL,
	"estimate_name" text NOT NULL,
	"estimate_date" date NOT NULL,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"customer_name" text,
	"customer_address" text,
	"customer_city" text,
	"customer_state" text,
	"customer_zip" text,
	"customer_phone" text,
	"customer_email" text,
	"cover_photo_key" text,
	"help_with" text,
	"intro_letter" text,
	"rep_name" text,
	"notes" text,
	"options_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lead_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_org_number_unique" ON "estimates" USING btree ("organization_id","estimate_number");