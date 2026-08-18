ALTER TYPE "public"."production_phase" ADD VALUE 'awaiting_supplements';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "check1_collected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "check2_collected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "check3_collected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "supplement_check_collected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Stages removed from the board (final_payment/negotiation/contracting/etc.) — remap
-- any rows still on them to the nearest surviving stage. final_payment jobs are
-- collected/complete, so they land on closed.
UPDATE "jobs" SET "production_phase" = 'closed' WHERE "production_phase" IN ('final_payment', 'payment_structure', 'contracting', 'materials_scheduling');--> statement-breakpoint
UPDATE "jobs" SET "production_phase" = 'installation' WHERE "production_phase" = 'negotiation';