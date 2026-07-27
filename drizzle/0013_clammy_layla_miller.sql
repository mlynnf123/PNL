CREATE TYPE "public"."estimate_doc_kind" AS ENUM('estimate_packet', 'legal_document');--> statement-breakpoint
CREATE TYPE "public"."estimate_doc_status" AS ENUM('draft', 'sent', 'signed', 'declined', 'void', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."estimate_page_type" AS ENUM('cover', 'introduction', 'inspection', 'quote', 'authorization', 'terms', 'warranty', 'custom', 'legal_body');--> statement-breakpoint
CREATE TYPE "public"."estimate_layout_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."estimate_layout_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "public"."document_entity_type" ADD VALUE 'estimate_layout';--> statement-breakpoint
CREATE TABLE "estimate_content_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_type" "estimate_page_type" NOT NULL,
	"name" text NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"prior_version_id" uuid,
	"frozen_payload_json" jsonb NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"doc_number" integer NOT NULL,
	"doc_kind" "estimate_doc_kind" DEFAULT 'estimate_packet' NOT NULL,
	"name" text NOT NULL,
	"doc_date" date NOT NULL,
	"status" "estimate_doc_status" DEFAULT 'draft' NOT NULL,
	"customer_name" text,
	"customer_address" text,
	"customer_city" text,
	"customer_state" text,
	"customer_zip" text,
	"customer_phone" text,
	"customer_email" text,
	"rep_name" text,
	"cover_photo_key" text,
	"layout_version_id" uuid,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"current_version_id" uuid,
	"lead_id" uuid,
	"job_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_layout_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_version_id" uuid NOT NULL,
	"page_type" "estimate_page_type" NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_content_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_layout_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"layout_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "estimate_layout_version_status" DEFAULT 'draft' NOT NULL,
	"prior_version_id" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"doc_kind" "estimate_doc_kind" DEFAULT 'estimate_packet' NOT NULL,
	"category" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "estimate_layout_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_type" "estimate_page_type" NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text,
	"included" boolean DEFAULT true NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estimate_content_templates" ADD CONSTRAINT "estimate_content_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_content_templates" ADD CONSTRAINT "estimate_content_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_document_versions" ADD CONSTRAINT "estimate_document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_document_versions" ADD CONSTRAINT "estimate_document_versions_document_id_estimate_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."estimate_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_document_versions" ADD CONSTRAINT "estimate_document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_documents" ADD CONSTRAINT "estimate_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_documents" ADD CONSTRAINT "estimate_documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_documents" ADD CONSTRAINT "estimate_documents_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_documents" ADD CONSTRAINT "estimate_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layout_pages" ADD CONSTRAINT "estimate_layout_pages_layout_version_id_estimate_layout_versions_id_fk" FOREIGN KEY ("layout_version_id") REFERENCES "public"."estimate_layout_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layout_versions" ADD CONSTRAINT "estimate_layout_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layout_versions" ADD CONSTRAINT "estimate_layout_versions_layout_id_estimate_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."estimate_layouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layout_versions" ADD CONSTRAINT "estimate_layout_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layout_versions" ADD CONSTRAINT "estimate_layout_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layouts" ADD CONSTRAINT "estimate_layouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_layouts" ADD CONSTRAINT "estimate_layouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_pages" ADD CONSTRAINT "estimate_pages_document_id_estimate_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."estimate_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estimate_content_templates_org_type_idx" ON "estimate_content_templates" USING btree ("organization_id","page_type");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_document_versions_doc_number_unique" ON "estimate_document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_documents_org_number_unique" ON "estimate_documents" USING btree ("organization_id","doc_number");--> statement-breakpoint
CREATE INDEX "estimate_layout_pages_version_idx" ON "estimate_layout_pages" USING btree ("layout_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_layout_versions_layout_number_unique" ON "estimate_layout_versions" USING btree ("layout_id","version_number");--> statement-breakpoint
CREATE INDEX "estimate_layouts_org_idx" ON "estimate_layouts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "estimate_pages_document_idx" ON "estimate_pages" USING btree ("document_id");