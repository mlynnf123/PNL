CREATE TYPE "public"."assignment_type" AS ENUM('primary_sales_rep', 'owner_override_recipient', 'project_manager', 'production_contact', 'other');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('Expected', 'Partial', 'DepreciationPending', 'FullyCollected', 'Disputed', 'WriteOffApproved');--> statement-breakpoint
CREATE TYPE "public"."collection_type" AS ENUM('initial_insurance', 'supplement', 'depreciation', 'deductible', 'customer_payment', 'other', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."cost_approval_status" AS ENUM('Draft', 'Submitted', 'Approved', 'Rejected', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."cost_category" AS ENUM('labor', 'material', 'permit', 'subcontractor', 'disposal', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_transaction_type" AS ENUM('purchase', 'charge', 'return', 'credit', 'reversal', 'correction');--> statement-breakpoint
CREATE TYPE "public"."funding_type" AS ENUM('insurance', 'retail', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_adjustment_status" AS ENUM('Draft', 'Submitted', 'Approved', 'Rejected', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."job_adjustment_type" AS ENUM('supp_x_fee', 'referral_fee', 'sales_rep_fee', 'owner_override_fee', 'deductible_adjustment', 'warranty_charge', 'other');--> statement-breakpoint
CREATE TYPE "public"."operational_status" AS ENUM('Draft', 'Contracted', 'InProduction', 'CompletionReview', 'OperationallyComplete', 'Reopened');--> statement-breakpoint
CREATE TYPE "public"."record_state" AS ENUM('Active', 'Closed', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."revenue_component_status" AS ENUM('Draft', 'Approved', 'Voided', 'Superseded');--> statement-breakpoint
CREATE TYPE "public"."revenue_component_type" AS ENUM('original_contract', 'supplement', 'change_order', 'deductible', 'discount', 'write_off', 'correction');--> statement-breakpoint
CREATE TABLE "collection_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"collection_type" "collection_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"received_date" date NOT NULL,
	"payer" text,
	"payment_method" text,
	"reference_number" text,
	"original_transaction_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"transaction_type" "cost_transaction_type" NOT NULL,
	"vendor_id" uuid,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"incurred_date" date NOT NULL,
	"invoice_reference" text,
	"approval_status" "cost_approval_status" DEFAULT 'Draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"original_transaction_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"email" text,
	"billing_address_line1" text,
	"billing_address_line2" text,
	"billing_city" text,
	"billing_state" text,
	"billing_postal_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"adjustment_type" "job_adjustment_type" NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"commission_treatment" text DEFAULT 'pre_commission' NOT NULL,
	"status" "job_adjustment_status" DEFAULT 'Draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_type" "assignment_type" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_address_line1" text NOT NULL,
	"property_address_line2" text,
	"property_city" text NOT NULL,
	"property_state" text NOT NULL,
	"property_postal_code" text NOT NULL,
	"funding_type" "funding_type" NOT NULL,
	"insurer_name" text,
	"claim_number" text,
	"original_contract_amount" numeric(12, 2) NOT NULL,
	"contracted_at" date NOT NULL,
	"operational_status" "operational_status" DEFAULT 'Contracted' NOT NULL,
	"collection_status" "collection_status" DEFAULT 'Expected' NOT NULL,
	"record_state" "record_state" DEFAULT 'Active' NOT NULL,
	"actual_completion_date" date,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"component_type" "revenue_component_type" NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" "revenue_component_status" DEFAULT 'Draft' NOT NULL,
	"effective_date" date NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reversed_component_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_transactions" ADD CONSTRAINT "collection_transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_transactions" ADD CONSTRAINT "collection_transactions_original_transaction_id_collection_transactions_id_fk" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."collection_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_transactions" ADD CONSTRAINT "collection_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_transactions" ADD CONSTRAINT "cost_transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_transactions" ADD CONSTRAINT "cost_transactions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_transactions" ADD CONSTRAINT "cost_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_transactions" ADD CONSTRAINT "cost_transactions_original_transaction_id_cost_transactions_id_fk" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."cost_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_transactions" ADD CONSTRAINT "cost_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_adjustments" ADD CONSTRAINT "job_adjustments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_adjustments" ADD CONSTRAINT "job_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_adjustments" ADD CONSTRAINT "job_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_components" ADD CONSTRAINT "revenue_components_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_components" ADD CONSTRAINT "revenue_components_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_components" ADD CONSTRAINT "revenue_components_reversed_component_id_revenue_components_id_fk" FOREIGN KEY ("reversed_component_id") REFERENCES "public"."revenue_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_components" ADD CONSTRAINT "revenue_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_org_job_number_unique" ON "jobs" USING btree ("organization_id","job_number");