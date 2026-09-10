CREATE TABLE "anamnesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"answers" jsonb NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"record_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"entry_type" text NOT NULL,
	"content" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"superseded_by_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odontogram_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"tooth_number" integer NOT NULL,
	"surface" text,
	"condition" text NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"term_version" text NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"cpf" text NOT NULL,
	"birth_date" text,
	"email" text,
	"phone" text,
	"address" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "anamnesis_patient_idx" ON "anamnesis" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "document_patient_idx" ON "clinical_document" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_record_key_version_idx" ON "clinical_record" USING btree ("tenant_id","record_key","version");--> statement-breakpoint
CREATE INDEX "clinical_record_patient_idx" ON "clinical_record" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "odontogram_patient_idx" ON "odontogram_entry" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "consent_patient_purpose_idx" ON "patient_consent" USING btree ("tenant_id","patient_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_tenant_cpf_idx" ON "patient" USING btree ("tenant_id","cpf");--> statement-breakpoint
CREATE INDEX "patient_tenant_idx" ON "patient" USING btree ("tenant_id");