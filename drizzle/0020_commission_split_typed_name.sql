ALTER TABLE "job_commission_splits" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_commission_splits" ADD COLUMN "recipient_name" text;