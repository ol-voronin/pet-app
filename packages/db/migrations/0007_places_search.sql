-- Fuzzy search by name: trigram index over every spelling of it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "search_text" text GENERATED ALWAYS AS ((lower(coalesce(name, '') || ' ' || coalesce(names->>'default', '') || ' ' || coalesce(names->>'uk', '') || ' ' || coalesce(names->>'ru', '') || ' ' || coalesce(names->>'en', '')))) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "places_search_idx" ON "places" USING gin ("search_text" gin_trgm_ops);