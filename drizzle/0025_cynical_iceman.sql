ALTER TABLE "carrier_scopes" ADD COLUMN "code_upgrade" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD COLUMN "debris_removal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD COLUMN "deductible_coverage_bucket" text;--> statement-breakpoint
ALTER TABLE "carrier_scopes" ADD COLUMN "deductible_coverage_limit" numeric(14, 2);