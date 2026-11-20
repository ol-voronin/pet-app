CREATE TYPE "public"."health_record_source" AS ENUM('manual', 'ocr', 'clinic');--> statement-breakpoint
CREATE TYPE "public"."health_record_type" AS ENUM('vaccination', 'treatment', 'visit', 'lab', 'medication', 'note', 'weight');--> statement-breakpoint
CREATE TABLE "health_record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"health_record_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_record_versions_record_version_unique" UNIQUE("health_record_id","version"),
	CONSTRAINT "health_record_versions_version_check" CHECK ("health_record_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"type" "health_record_type" NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"title" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "health_record_source" DEFAULT 'manual' NOT NULL,
	"source_document_id" uuid,
	"clinic_name" text,
	"vet_name" text,
	"next_due_date" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "health_records_version_check" CHECK ("health_records"."version" >= 1),
	CONSTRAINT "health_records_ocr_document_check" CHECK ("health_records"."source" <> 'ocr' OR "health_records"."source_document_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "health_record_versions" ADD CONSTRAINT "health_record_versions_health_record_id_health_records_id_fk" FOREIGN KEY ("health_record_id") REFERENCES "public"."health_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_record_versions" ADD CONSTRAINT "health_record_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_records_pet_date_idx" ON "health_records" USING btree ("pet_id","date");