SET search_path TO "smart_scheduling", public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "allow_overbooking" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_valid_interval" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_provider_no_overlap" EXCLUDE USING gist (
	"tenant_id" WITH =,
	"provider_id" WITH =,
	tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" <> 'cancelled' AND "allow_overbooking" = false);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_resource_no_overlap" EXCLUDE USING gist (
	"tenant_id" WITH =,
	"resource_id" WITH =,
	tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("resource_id" IS NOT NULL AND "status" <> 'cancelled' AND "allow_overbooking" = false);
