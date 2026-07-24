CREATE TYPE "public"."call_status" AS ENUM('completed', 'missed', 'busy', 'no_answer', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."call_success" AS ENUM('success', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_name" text,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"status" "call_status" DEFAULT 'completed' NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"call_successful" "call_success" DEFAULT 'success' NOT NULL,
	"appointment_booked" boolean DEFAULT false NOT NULL,
	"appointment_details" jsonb,
	"lead_id" uuid,
	"notes" text,
	"agent_id" text,
	"conversation_id" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;