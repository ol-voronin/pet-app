-- Phones become a JSON array: the admin panel (Directus) cannot edit Postgres `text[]`.
-- Existing values are converted in place, nothing is lost.
ALTER TABLE "places" ALTER COLUMN "phones" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "phones" SET DATA TYPE jsonb USING to_jsonb("phones");--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "phones" SET DEFAULT '[]'::jsonb;
