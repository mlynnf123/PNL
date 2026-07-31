CREATE TABLE "job_commission_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"rate_pct" numeric(5, 4) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_allocation_batches" ALTER COLUMN "rule_set_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_allocations" ALTER COLUMN "source_rule_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_allocations" ADD COLUMN "source_split_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "deal_owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "universal_share_user_id" uuid;--> statement-breakpoint
ALTER TABLE "job_commission_splits" ADD CONSTRAINT "job_commission_splits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_commission_splits" ADD CONSTRAINT "job_commission_splits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_commission_splits" ADD CONSTRAINT "job_commission_splits_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_commission_splits" ADD CONSTRAINT "job_commission_splits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_commission_splits_job_recipient_unique" ON "job_commission_splits" USING btree ("job_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "job_commission_splits_job_idx" ON "job_commission_splits" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "commission_allocations" ADD CONSTRAINT "commission_allocations_source_split_id_job_commission_splits_id_fk" FOREIGN KEY ("source_split_id") REFERENCES "public"."job_commission_splits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_deal_owner_user_id_users_id_fk" FOREIGN KEY ("deal_owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;