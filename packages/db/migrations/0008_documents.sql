CREATE TYPE "public"."document_kind" AS ENUM('scan', 'file');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('stored', 'uploaded', 'processing', 'needs_review', 'confirmed', 'failed');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"pages" integer,
	"kind" "document_kind" DEFAULT 'file' NOT NULL,
	"status" "document_status" DEFAULT 'stored' NOT NULL,
	"doc_type" text,
	"model" text,
	"prompt_version" text,
	"raw_extraction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_pet_idx" ON "documents" USING btree ("pet_id","created_at");