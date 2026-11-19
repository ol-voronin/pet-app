# apps/api

Fastify 5 REST API (ADR-0002). OpenAPI 3.1 is generated from zod schemas.

## Run
- `pnpm -F api dev` — watch mode on `PORT` (default 3000)
- `GET /health` — liveness; `GET /docs` — Swagger UI

## Module conventions
- One module = one Fastify plugin in `src/modules/<module>/index.ts`, registered in `src/app.ts`.
- Request/response schemas are zod schemas from `@pet-app/shared` — the same ones the mobile app uses.
- Every route has an `operationId` (it becomes the method name in the generated client) and `tags`.
- Tests use `buildApp()` + `app.inject()`; no network, no real DB unless the test says so.

## API client
After changing routes or schemas run `pnpm gen:api` (from the repo root). It writes
`packages/shared/openapi.json` and the typed client types in `packages/shared/src/api/openapi.ts`.
A test fails if the committed spec is out of date.

## File storage
Private S3-compatible bucket (ADR-0006: Neon Object Storage). Code in `src/modules/storage`:
`startUpload()` checks type and size and returns a signed PUT URL (10 min), `confirmUpload()` re-checks
what landed in the bucket, `createDownloadUrl()` signs a GET (15 min). The database stores object keys only.

Set all of these or none (without them the API runs without file uploads):
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
(`S3_FORCE_PATH_STYLE` defaults to `true`). For Neon: endpoint of the branch, region `eu-central-1`,
bucket `pet-app-files`, key id = credential `token_id`, secret = `s3_secret_access_key`
(Neon Console → Connect → Storage). Keys live in environment secrets, never in the repository.

## Deploy (staging, free)
Vercel Hobby, project `pet-app-api`, Root Directory `apps/api`, region `fra1` (Frankfurt, next to Neon).
Entry point is `src/index.ts` (Vercel's Fastify preset intercepts `listen`).
Environment variables on Vercel: `APP_ENV=staging`, `DATABASE_URL` (Neon `dev` branch), `JWT_SECRET`,
`OTP_FIXED_CODE=000000`. Staging accepts the fixed code for every phone — it is a test server, not production.
