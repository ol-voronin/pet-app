# apps/api

Fastify 5 REST API (ADR-0002). OpenAPI 3.1 is generated from zod schemas.

## Run
- `pnpm -F api dev` — watch mode on `PORT` (default 3000)
- `GET /health` — liveness; `GET /openapi.json` — the spec; `GET /docs` — Swagger UI (only with `APP_ENV=development`)

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
Entry point is `src/index.ts`: it imports `fastify` itself, because Vercel's preset looks for the file that does.
Workspace packages are compiled to `dist` (`pnpm build`); Vercel runs only JavaScript from `node_modules`.
Swagger UI is not loaded outside development: its dependency `require()`s an ESM-only package, which Vercel's
Node runtime rejects.

Check a deploy change locally the way Vercel runs it (Node 22, compiled entry, no `require` of ESM):
```bash
pnpm -F @pet-app/shared build && pnpm -F @pet-app/db build
cd apps/api && npx tsc -p tsconfig.json --noEmit false
APP_ENV=staging OTP_FIXED_CODE=000000 DATABASE_URL=… JWT_SECRET=… node --no-experimental-require-module dist/index.js
```
Environment variables on Vercel: `APP_ENV=staging`, `DATABASE_URL` (Neon `dev` branch), `JWT_SECRET`,
`OTP_FIXED_CODE=000000`. Staging accepts the fixed code for every phone — it is a test server, not production.
