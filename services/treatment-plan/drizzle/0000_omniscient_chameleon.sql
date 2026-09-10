CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_key" uuid NOT NULL,
	"item_id" uuid,
	"decision" text NOT NULL,
	"decided_by_user_id" uuid NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_cost" numeric(12, 2) NOT NULL,
	"licensed_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_plan_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_key" uuid NOT NULL,
	"plan_version" integer NOT NULL,
	"procedure_id" uuid NOT NULL,
	"estimated_cost" numeric(12, 2) NOT NULL,
	"phase" integer DEFAULT 1 NOT NULL,
	"order_in_phase" integer DEFAULT 0 NOT NULL,
	"depends_on_item_id" uuid,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"plan_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"superseded_by_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "acceptance_plan_idx" ON "plan_acceptance" USING btree ("tenant_id","plan_key");--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_tenant_name_idx" ON "procedure_catalog" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "procedure_tenant_idx" ON "procedure_catalog" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_plan_idx" ON "treatment_plan_item" USING btree ("tenant_id","plan_key","plan_version");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_key_version_idx" ON "treatment_plan" USING btree ("tenant_id","plan_key","version");--> statement-breakpoint
CREATE INDEX "plan_patient_idx" ON "treatment_plan" USING btree ("tenant_id","patient_id");