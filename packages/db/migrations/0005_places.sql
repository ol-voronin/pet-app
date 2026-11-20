CREATE TYPE "public"."osm_type" AS ENUM('node', 'way', 'relation');--> statement-breakpoint
CREATE TYPE "public"."place_category" AS ENUM('clinic', 'pharmacy', 'dog_park', 'shop', 'groomer', 'trainer', 'cafe', 'other');--> statement-breakpoint
CREATE TYPE "public"."place_moderation" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."place_source" AS ENUM('osm', 'manual', 'user');--> statement-breakpoint
CREATE TYPE "public"."place_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "place_category" NOT NULL,
	"name" text,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"geom" geography(Point, 4326) GENERATED ALWAYS AS ((ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)) STORED NOT NULL,
	"address" text,
	"city" text,
	"phones" text[] DEFAULT '{}'::text[] NOT NULL,
	"website" text,
	"opening_hours" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "place_source" NOT NULL,
	"visibility" "place_visibility" DEFAULT 'public' NOT NULL,
	"moderation_status" "place_moderation" DEFAULT 'approved' NOT NULL,
	"created_by" uuid,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"osm_type" "osm_type",
	"osm_id" bigint,
	"osm_tags" jsonb,
	"osm_seen_at" timestamp with time zone,
	"osm_missing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_geom_idx" ON "places" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX "places_osm_idx" ON "places" USING btree ("osm_type","osm_id");--> statement-breakpoint
CREATE INDEX "places_category_idx" ON "places" USING btree ("category");--> statement-breakpoint
CREATE INDEX "places_moderation_idx" ON "places" USING btree ("moderation_status") WHERE "places"."visibility" = 'public' and "places"."source" = 'user';