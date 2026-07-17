CREATE TYPE "public"."close_attempt_status" AS ENUM('Draft', 'Blocked', 'Submitted', 'Approved', 'Rejected', 'Superseded');--> statement-breakpoint
CREATE TYPE "public"."completion_review_status" AS ENUM('Draft', 'Submitted', 'Approved', 'Rejected', 'Superseded');--> statement-breakpoint
CREATE TYPE "public"."finalization_category" AS ENUM('labor', 'material', 'adjustments');--> statement-breakpoint
CREATE TYPE "public"."finalization_status" AS ENUM('Open', 'ReadyForReview', 'Final', 'Reopened');--> statement-breakpoint
CREATE TYPE "public"."financial_close_status" AS ENUM('NotReady', 'Ready', 'InReview', 'Closed', 'Reopened');--> statement-breakpoint
CREATE TYPE "public"."reopen_reason_type" AS ENUM('late_cost', 'return', 'revenue_correction', 'accounting_error', 'warranty', 'other');--> statement-breakpoint
CREATE TYPE "public"."reopen_request_status" AS ENUM('Requested', 'Approved', 'Rejected', 'Completed');--> statement-breakpoint
CREATE TABLE "completion_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version_number" integer NOT NULL,
	"checklist_items_json" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_category_finalizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"category" "finalization_category" NOT NULL,
	"status" "finalization_status" DEFAULT 'Open' NOT NULL,
	"final_amount" numeric(12, 2),
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reopened_by" uuid,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text
);
--> statement-breakpoint
CREATE TABLE "financial_close_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "close_attempt_status" DEFAULT 'Draft' NOT NULL,
	"gate_results_json" jsonb,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "financial_close_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"prior_version_id" uuid,
	"expected_revenue" numeric(12, 2) NOT NULL,
	"collected_revenue" numeric(12, 2) NOT NULL,
	"final_labor_cost" numeric(12, 2) NOT NULL,
	"final_material_cost" numeric(12, 2) NOT NULL,
	"pre_commission_adjustments" numeric(12, 2) NOT NULL,
	"commissionable_profit" numeric(12, 2) NOT NULL,
	"input_snapshot_json" jsonb NOT NULL,
	"created_from_attempt_id" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reopen_reason_from_prior" text
);
--> statement-breakpoint
CREATE TABLE "financial_reopen_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"current_version_id" uuid NOT NULL,
	"reason_type" "reopen_reason_type" NOT NULL,
	"explanation" text NOT NULL,
	"estimated_financial_impact" numeric(12, 2),
	"status" "reopen_request_status" DEFAULT 'Requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_completion_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"answer" boolean NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_completion_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"status" "completion_review_status" DEFAULT 'Submitted' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"actual_completion_date" date,
	"rejection_reason" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "financial_close_status" "financial_close_status" DEFAULT 'NotReady' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "current_financial_version_id" uuid;--> statement-breakpoint
ALTER TABLE "completion_checklist_templates" ADD CONSTRAINT "completion_checklist_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_category_finalizations" ADD CONSTRAINT "cost_category_finalizations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_category_finalizations" ADD CONSTRAINT "cost_category_finalizations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_category_finalizations" ADD CONSTRAINT "cost_category_finalizations_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_attempts" ADD CONSTRAINT "financial_close_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_attempts" ADD CONSTRAINT "financial_close_attempts_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_attempts" ADD CONSTRAINT "financial_close_attempts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_versions" ADD CONSTRAINT "financial_close_versions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_versions" ADD CONSTRAINT "financial_close_versions_prior_version_id_financial_close_versions_id_fk" FOREIGN KEY ("prior_version_id") REFERENCES "public"."financial_close_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_versions" ADD CONSTRAINT "financial_close_versions_created_from_attempt_id_financial_close_attempts_id_fk" FOREIGN KEY ("created_from_attempt_id") REFERENCES "public"."financial_close_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_close_versions" ADD CONSTRAINT "financial_close_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reopen_requests" ADD CONSTRAINT "financial_reopen_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reopen_requests" ADD CONSTRAINT "financial_reopen_requests_current_version_id_financial_close_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."financial_close_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reopen_requests" ADD CONSTRAINT "financial_reopen_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reopen_requests" ADD CONSTRAINT "financial_reopen_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_answers" ADD CONSTRAINT "job_completion_answers_review_id_job_completion_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."job_completion_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_answers" ADD CONSTRAINT "job_completion_answers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_reviews" ADD CONSTRAINT "job_completion_reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_reviews" ADD CONSTRAINT "job_completion_reviews_template_version_id_completion_checklist_templates_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."completion_checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_reviews" ADD CONSTRAINT "job_completion_reviews_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_completion_reviews" ADD CONSTRAINT "job_completion_reviews_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_category_finalizations_job_category_unique" ON "cost_category_finalizations" USING btree ("job_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_close_versions_job_version_unique" ON "financial_close_versions" USING btree ("job_id","version_number");