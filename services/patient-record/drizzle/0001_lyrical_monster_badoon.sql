SET search_path TO "patient_record", public;
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "portal_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_tenant_portal_user_idx" ON "patient" USING btree ("tenant_id","portal_user_id");
