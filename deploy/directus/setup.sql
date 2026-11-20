-- Database access for the admin panel (Directus). Run once as the database owner
-- (Neon Console → SQL Editor, branch `dev`), with a real password instead of CHANGE_ME.
--
-- The panel gets its own role that sees exactly one application table: `places`.
-- Users, sessions, pets and (later) medical records stay invisible to it.
-- Its own tables (`directus_*`) live in a separate schema, away from ours.

CREATE ROLE directus_admin LOGIN PASSWORD 'CHANGE_ME';

CREATE SCHEMA IF NOT EXISTS directus AUTHORIZATION directus_admin;
ALTER ROLE directus_admin SET search_path = directus, public;

GRANT USAGE ON SCHEMA public TO directus_admin;
-- No DELETE on purpose: a point is hidden (`deleted_at`), never removed.
GRANT SELECT, INSERT, UPDATE ON public.places TO directus_admin;
