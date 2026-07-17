CREATE TYPE "public"."commission_allocation_type" AS ENUM('primary_sales', 'owner_override', 'universal_owner_share');--> statement-breakpoint
CREATE TYPE "public"."commission_batch_status" AS ENUM('Proposed', 'InReview', 'Approved', 'Rejected', 'Superseded', 'OnHold');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('NotEligible', 'Ready', 'InReview', 'Approved', 'PartiallyPaid', 'Paid', 'Adjusted', 'OnHold');--> statement-breakpoint
CREATE TYPE "public"."commission_transaction_type" AS ENUM('draw', 'payment', 'clawback_debit', 'clawback_offset', 'adjustment_credit', 'adjustment_debit', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."rule_set_status" AS ENUM('Draft', 'Active', 'Retired');--> statement-breakpoint
CREATE TYPE "public"."seller_match_type" AS ENUM('owner_seller', 'standard_rep', 'named_user');--> statement-breakpoint
CREATE TABLE "commission_allocation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"financial_close_version_id" uuid NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"status" "commission_batch_status" DEFAULT 'Proposed' NOT NULL,
	"total_allocated_amount" numeric(12, 2) NOT NULL,
	"company_profit" numeric(12, 2) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "commission_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"allocation_type" "commission_allocation_type" NOT NULL,
	"source_rule_id" uuid NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"basis_amount" numeric(12, 2) NOT NULL,
	"earned_amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version_number" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" "rule_set_status" DEFAULT 'Draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"seller_match_type" "seller_match_type" NOT NULL,
	"seller_user_id" uuid,
	"allocation_type" "commission_allocation_type" NOT NULL,
	"recipient_user_id" uuid,
	"rate" numeric(5, 4) NOT NULL,
	"conditions_json" jsonb,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid,
	"allocation_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"transaction_type" "commission_transaction_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"transaction_date" date NOT NULL,
	"reason" text,
	"payment_method" text,
	"reference_number" text,
	"original_transaction_id" uuid,
	"posted_by" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "commission_status" "commission_status" DEFAULT 'NotEligible' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_allocation_batches" ADD CONSTRAINT "commission_allocation_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocation_batches" ADD CONSTRAINT "commission_allocation_batches_financial_close_version_id_financial_close_versions_id_fk" FOREIGN KEY ("financial_close_version_id") REFERENCES "public"."financial_close_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocation_batches" ADD CONSTRAINT "commission_allocation_batches_rule_set_id_commission_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."commission_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocation_batches" ADD CONSTRAINT "commission_allocation_batches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocations" ADD CONSTRAINT "commission_allocations_batch_id_commission_allocation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."commission_allocation_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocations" ADD CONSTRAINT "commission_allocations_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_allocations" ADD CONSTRAINT "commission_allocations_source_rule_id_commission_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule_sets" ADD CONSTRAINT "commission_rule_sets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule_sets" ADD CONSTRAINT "commission_rule_sets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_rule_set_id_commission_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."commission_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_allocation_id_commission_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."commission_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_original_transaction_id_commission_transactions_id_fk" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."commission_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_transactions" ADD CONSTRAINT "commission_transactions_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;