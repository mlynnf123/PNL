CREATE TYPE "public"."import_batch_status" AS ENUM('Parsed', 'Committed', 'PartiallyCommitted', 'RolledBack', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."import_exception_category" AS ENUM('identity', 'assignment', 'money_type', 'percentage', 'formula', 'reconciliation', 'payment_narrative', 'date', 'completion', 'duplicate', 'negative_profit');--> statement-breakpoint
CREATE TYPE "public"."import_exception_severity" AS ENUM('blocker', 'warning');--> statement-breakpoint
CREATE TYPE "public"."import_exception_status" AS ENUM('Open', 'Resolved', 'Accepted', 'Deferred');--> statement-breakpoint
CREATE TYPE "public"."import_source_row_status" AS ENUM('Pending', 'Valid', 'Blocked', 'Committed', 'Excluded');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"sheet_name" text NOT NULL,
	"parser_version" text NOT NULL,
	"source_as_of_date" date NOT NULL,
	"status" "import_batch_status" DEFAULT 'Parsed' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"reconciliation_json" jsonb,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_by" uuid,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_row_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"category" "import_exception_category" NOT NULL,
	"severity" "import_exception_severity" NOT NULL,
	"field" text,
	"detail" text NOT NULL,
	"status" "import_exception_status" DEFAULT 'Open' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_row_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_source_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_json" jsonb NOT NULL,
	"normalized_json" jsonb,
	"display_name" text,
	"status" "import_source_row_status" DEFAULT 'Pending' NOT NULL,
	"resolution_json" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_source_row_id_import_source_rows_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."import_source_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_record_links" ADD CONSTRAINT "import_record_links_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_record_links" ADD CONSTRAINT "import_record_links_source_row_id_import_source_rows_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."import_source_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_source_rows" ADD CONSTRAINT "import_source_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_source_rows" ADD CONSTRAINT "import_source_rows_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_org_hash_unique" ON "import_batches" USING btree ("organization_id","file_hash") WHERE status <> 'RolledBack';--> statement-breakpoint
CREATE UNIQUE INDEX "import_record_links_idempotency_unique" ON "import_record_links" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "import_source_rows_batch_row_unique" ON "import_source_rows" USING btree ("batch_id","row_number");