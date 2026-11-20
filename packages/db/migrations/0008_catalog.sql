CREATE TYPE "public"."product_kind" AS ENUM('flea_tick', 'deworming', 'combined');--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_uk" text NOT NULL,
	"name_en" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manufacturer" text,
	"kind" "product_kind" NOT NULL,
	"species" jsonb NOT NULL,
	"substances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vaccines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_uk" text NOT NULL,
	"name_en" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manufacturer" text,
	"species" jsonb NOT NULL,
	"against" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vaccines_slug_unique" UNIQUE("slug")
);
