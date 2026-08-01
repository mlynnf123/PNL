CREATE TYPE "public"."setter_cost_status" AS ENUM('Active', 'Voided');--> statement-breakpoint
CREATE TABLE "setter_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_place" text NOT NULL,
	"incurred_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"sales_rep_user_id" uuid,
	"purchased_by" text,
	"status" "setter_cost_status" DEFAULT 'Active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "setter_costs" ADD CONSTRAINT "setter_costs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_costs" ADD CONSTRAINT "setter_costs_sales_rep_user_id_users_id_fk" FOREIGN KEY ("sales_rep_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setter_costs" ADD CONSTRAINT "setter_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setter_costs_org_idx" ON "setter_costs" USING btree ("organization_id");