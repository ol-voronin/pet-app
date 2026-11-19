CREATE TYPE "public"."pet_hero" AS ENUM('avatar', 'photo');--> statement-breakpoint
CREATE TYPE "public"."pet_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."pet_species" AS ENUM('dog', 'cat', 'other');--> statement-breakpoint
CREATE TABLE "pet_members" (
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "pet_role" NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_members_pet_id_user_id_pk" PRIMARY KEY("pet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"species" "pet_species" NOT NULL,
	"breed" text,
	"sex" "pet_sex",
	"birth_date" date,
	"color" text,
	"sterilized" boolean,
	"chip_number" text,
	"registry_number" text,
	"tag_number" text,
	"notes" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"avatar" jsonb,
	"avatar_key" text,
	"photo_key" text,
	"hero" "pet_hero" DEFAULT 'avatar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pet_members" ADD CONSTRAINT "pet_members_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_members" ADD CONSTRAINT "pet_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_members" ADD CONSTRAINT "pet_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_members_user_idx" ON "pet_members" USING btree ("user_id");