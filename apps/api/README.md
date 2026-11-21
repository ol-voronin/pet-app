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

## Deploy: Vercel (backup staging, free)
Kept until the server below is up and checked. Vercel Hobby, project `pet-app-api`, Root Directory `apps/api`, region `fra1` (Frankfurt, next to Neon).
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

## Family limit check (live)
The Free member limit is enforced in the database transaction that adds a member: a per-pet advisory lock, then
the insert only while every pet has room (`src/modules/family/drizzle-repo.ts`, QA #50). Unit tests use the in-memory
repository; the SQL itself is covered by the repository tests below (two simultaneous acceptances, ten rounds).
The same race can be run against Neon `dev` (creates and deletes its own rows):
```bash
DATABASE_URL=… pnpm -F api check:family-limit
```

The medical card API end to end on a running staging server (`OTP_FIXED_CODE` set): owner, editor, viewer and a
stranger, versions, a no-op edit, five parallel edits, soft delete. Signs in fresh test phones, deletes its pets:
```bash
API_URL=https://pet.195-201-110-152.sslip.io pnpm -F api check:health-records
```

## Repository tests on Postgres
`src/modules/**/drizzle-repo.db.test.ts` run every `Drizzle*Repo` against a real PostgreSQL 17 + PostGIS 3.5
(ADR-0012). They use the production path — `createDb()`, drizzle `neon-http`, `db.batch` — and only the HTTP hop to
Neon is replaced by a local connection (`packages/db-testing`). `pnpm test` does not run them and needs no database.
```bash
docker run -d --name pet-app-test-db -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5432:5432 postgis/postgis:17-3.5
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db
```
Each run creates its own database `pet_app_test_…`, applies `packages/db/migrations` and drops it at the end, so
other databases on that server are not touched. Only `localhost` is accepted: the tests cannot be pointed at Neon.
In CI this is the job "repositories on Postgres". A new query in a `drizzle-repo.ts` gets a test here in the same PR.
Not covered: limits and timeouts of Neon's own HTTP proxy — what depends on them is still checked on Neon `dev`.

## Map API
`src/modules/places`: routes behind sign-in. A person gets public, approved, not hidden places and their family's own markers.
- `GET /places?bbox=west,south,east,north&categories=clinic,pharmacy&open247=true` — pins for the visible map
  (up to 1000; `truncated` says there were more).
- `GET /places/nearby?lat=&lon=&radiusM=&limit=` — list by distance.
- `GET /places/search?q=&lat=&lon=` — by name. Forgives typos (Postgres `pg_trgm`), a Russian spelling stored in
  OSM and a wrong keyboard layout (`dtnfgntrf` → `ветаптека`); see `search-text.ts`.
- `GET /places/:placeId` — the card.
- `POST /places` — the person's own marker (`name`, `category`, `lat`, `lon`, `visibility`). `private` (default) is
  seen at once by the author and their family — everyone who shares a pet with them. `public` waits for a moderator
  (`moderation_status = pending`, the "Черга модерації" view in the admin panel); until approved only the family sees it.
  At most 100 own markers per person. `DELETE /places/:placeId` — the author only; the row is kept (`deleted_at`).
- Every read is per viewer: public approved places plus own markers of the viewer's family. `mine` marks the latter.
- `GET /geocode?q=&lat=&lon=` — address search in Ukraine through Photon (ADR-0005), cached for a day, one
  request at a time. What leaves our server: the typed address and the map centre rounded to about 1 km — no
  user id and no phone IP. `GEOCODER_URL` points it at another Photon server; when it is down the route answers 503.

Not done yet: "open now" (needs an `opening_hours` parser; two thirds of places have no hours in OSM) and
search by service (second version, `docs/PRD.md`).

## Map places (OpenStreetMap import)
`src/modules/places/osm`: `mapping.ts` turns OSM tags into our categories, `import.ts` holds the rules,
`src/scripts/import-osm.ts` is the entry. Data source is the Overpass API; Google Places is never used.
```bash
DATABASE_URL=… pnpm -F api osm:import
```
Other modes: `--bbox=south,west,north,east` (partial run), `--from-file=overpass.json`, `--dry-run`
(fetch and count, write nothing), `--save=file.json` (keep the raw answer). `OVERPASS_URL` overrides the servers.

Rules: an unverified point is refreshed from OSM; a point a person verified (`verified_at`) is never
overwritten — only its `osm_tags` snapshot is; a point that left OSM gets `osm_missing_since` and is kept;
if a full run returns under 70% of the points shown now, nothing is hidden (a broken answer, not a mass closure).

The `OSM import` workflow runs it every Monday. It writes only when the repository secret
`OSM_IMPORT_DATABASE_URL` is set; otherwise it fetches, counts and stores the raw answer as an artifact.

## Error reports (Sentry)
Set `SENTRY_DSN` and requests that end with a 5xx are reported to Sentry; without it nothing is sent and the
SDK is not even loaded. Reports carry the HTTP method, the route pattern (`/pets/:petId`) and the request id —
no bodies, headers, query strings or user data. Code: `src/observability/errors.ts`.

## Deploy: own server (Docker + Caddy + Redis)
Decision: `docs/adr/0009-api-hosting.md`. The image is built by `.github/workflows/deploy.yml` on every push to
`main` and loaded onto the server over SSH (no registry). On the server: `deploy/docker-compose.yml` with the
API, Caddy (HTTPS, automatic certificate) and Redis. The database stays in Neon, files in Neon Object Storage.
Migrations are not run by the deploy: `pnpm -F db migrate` stays a deliberate manual step.

Check a change locally the way the server runs it (same Node as CI, compiled entry):
```bash
docker build -f apps/api/Dockerfile --build-arg "NODE_IMAGE=node:$(cat .nvmrc)-slim" -t pet-app-api .
```
```bash
docker run --rm -p 3000:3000 -e APP_ENV=staging -e OTP_FIXED_CODE=000000 -e DATABASE_URL=… -e JWT_SECRET=… pet-app-api
```
The whole stack: copy `deploy/` to a folder, add `.env` with `API_DOMAIN=localhost` and the variables below,
`docker compose up -d`, then `https://localhost/health` (Caddy signs `localhost` with its own local CA).

### Пошагово для владельца: сервер
Нужно один раз. Команды — на сервере под `root`, если не сказано иначе. Ничего платного: сервер уже есть.

**Быстрый путь — одна команда на сервере** (Docker, пользователь, `.env`, сборка и запуск, подключение к
веб-серверу и автодеплой: таймер раз в 5 минут забирает `main` и обновляет API, `deploy/update.sh`):
```bash
curl -fsSL https://raw.githubusercontent.com/ol-voronin/pet-app/main/deploy/setup-server.sh | sudo bash
```
Спросит адрес для API (Enter — бесплатный `<IP>.sslip.io`) и строку подключения к Neon. Секреты GitHub при этом
не нужны. Журнал обновлений: `journalctl -u pet-app-update`; обновить сейчас: `sudo -u deploy /opt/pet-app/src/deploy/update.sh --force`.
Ниже — запасной путь руками, с доставкой из GitHub Actions по SSH.

1. **Docker.** Проверить: `docker compose version`. Если команды нет:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. **Свободны ли порты 80 и 443.** На сервере могут жить другие проекты:
   ```bash
   ss -ltnp | grep -E ':(80|443) '
   ```
   Пусто — всё хорошо: в `.env` будет `COMPOSE_PROFILES=caddy`, и запустится наш Caddy. Если порты держит Caddy
   другого проекта, наш не нужен: в его Caddyfile добавляется отдельный блок для `API_DOMAIN` с
   `reverse_proxy 127.0.0.1:<API_HOST_PORT>` (скрипт делает это сам, между метками `# >>> pet-app` и `# <<< pet-app`,
   с копией файла и откатом, если Caddy не примет). Если порты держит что-то другое — напиши в чат.
3. **Пользователь для деплоя и папка.** Группа `docker` даёт права, равные `root`, поэтому ключ этого
   пользователя храним только в секретах GitHub.
   ```bash
   adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
   ```
   ```bash
   install -d -o deploy -g deploy -m 750 /opt/pet-app
   ```
4. **Ключ SSH для деплоя.** На своём Mac (не на сервере):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/pet-app-deploy -N "" -C "pet-app deploy"
   ```
   Показать публичную часть: `cat ~/.ssh/pet-app-deploy.pub`. На сервере вставить её вместо `ssh-ed25519 …`:
   ```bash
   install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
   ```
   ```bash
   echo 'ssh-ed25519 …' >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
   ```
5. **Адрес.** Caddy сам получит сертификат, когда имя указывает на сервер. Лучше свой домен: A-запись
   `api.<твой-домен>` → IP сервера. Домена нет — временно подойдёт бесплатное имя `<IP-через-дефисы>.sslip.io`
   (для `203.0.113.7` это `203-0-113-7.sslip.io`); у таких имён общий лимит сертификатов, выпуск может не пройти с первого раза.
6. **Секреты на сервере** — файл `/opt/pet-app/.env`. В репозиторий он не попадает. Значения — те же, что сейчас на Vercel.
   ```bash
   nano /opt/pet-app/.env
   ```
   ```
   API_DOMAIN=api.example.com
   APP_ENV=staging
   OTP_FIXED_CODE=000000
   DATABASE_URL=postgresql://…   (Neon → ветка dev → Connect → pooled)
   JWT_SECRET=…                  (не короче 32 символов: openssl rand -hex 32)
   SENTRY_DSN=                   (пусто, пока нет аккаунта Sentry)
   ```
   Хранилище файлов, когда появятся ключи (все пять или ни одного): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Комментарии в скобках в файл не переносить. Затем:
   ```bash
   chown deploy:deploy /opt/pet-app/.env && chmod 600 /opt/pet-app/.env
   ```
7. **Файрвол.** Открыть входящие 80/tcp, 443/tcp и 443/udp (в панели Hetzner Robot → Firewall, если он включён;
   на сервере, если стоит `ufw`: `ufw allow 80,443/tcp && ufw allow 443/udp`). Порт SSH оставить открытым.

### Пошагово для владельца: GitHub
1. Репозиторий → Settings → Secrets and variables → Actions → **New repository secret**:
   - `SSH_HOST` — IP или имя сервера;
   - `SSH_KEY` — содержимое файла `~/.ssh/pet-app-deploy` целиком (приватная часть, с первой до последней строки).
2. Необязательно, вкладка **Variables**: `SSH_USER` (по умолчанию `deploy`), `SSH_PORT` (по умолчанию `22`).
   Необязательный секрет `SSH_KNOWN_HOSTS` — вывод `ssh-keyscan <сервер>`: тогда деплой сверяет ключ сервера.
3. Actions → **Deploy API** → Run workflow (ветка `main`). Дальше деплой идёт сам при каждом слиянии в `main`.
4. Проверка: `https://<API_DOMAIN>/health` отвечает `{"status":"ok",…}`. После этого напиши в чат адрес —
   приложение переключим на него (`apps/mobile/app.json` → `extra.apiUrl`), Vercel останется запасным.

Пока секретов `SSH_HOST` и `SSH_KEY` нет, workflow только собирает образ и проверяет, что он стартует.

### Пошагово для владельца: админка точек (Directus)
Админка нужна, чтобы руками проверять точки Харькова и разбирать очередь меток. Живёт на том же сервере, адрес —
`https://<API_DOMAIN>/cms/admin`. Бесплатно: тариф Core, ключ не нужен. Делать после того, как заработал сам сервер.

1. **Доступ к базе.** Neon Console → SQL Editor → ветка `dev` → вставить `deploy/directus/setup.sql`, заменив
   `CHANGE_ME` на свой пароль (`openssl rand -hex 24`). Скрипт создаёт отдельного пользователя базы, который из
   наших таблиц видит только `places`: пользователей, питомцев и медкарты админка прочитать не может.
2. **Секреты админки** — файл `/opt/pet-app/directus.env` на сервере (в репозиторий не попадает):
   ```
   SECRET=…                      (openssl rand -hex 32)
   DB_CONNECTION_STRING=postgresql://directus_admin:<пароль из шага 1>@<хост Neon без -pooler>/petapp?sslmode=require
   ADMIN_EMAIL=…                 (твой e-mail — логин в админку)
   ADMIN_PASSWORD=…              (длинный пароль)
   ```
   Хост — из строки подключения Neon с выключенным «Connection pooling»: через pooler админка не работает надёжно.
   Затем: `chown deploy:deploy /opt/pet-app/directus.env && chmod 600 /opt/pet-app/directus.env`.
3. **Включить.** В `/opt/pet-app/.env` дописать `admin` в `COMPOSE_PROFILES` (`COMPOSE_PROFILES=caddy,admin`, а если
   строки нет — `COMPOSE_PROFILES=admin`), затем:
   ```bash
   cd /opt/pet-app && docker compose up -d
   ```
4. **Настроить форму, виды и роль** — один раз (и после обновления скрипта):
   ```bash
   docker run --rm --network pet-app_default --env-file /opt/pet-app/directus.env -e DIRECTUS_URL=http://directus:8055 -v /opt/pet-app/directus:/w:ro node:22-slim node /w/bootstrap.mjs
   ```
5. **Первый вход.** `https://<API_DOMAIN>/cms/admin`. Directus спросит тариф — выбрать «I'm using Core plan» — и
   e-mail владельца проекта с согласием на лицензию: это твоё решение, за тебя его никто не принимает.
6. **Как проверять.** Слева вид «Харків — не перевірені». Открыть точку, поправить название, адрес, телефон,
   поставить дату в «Verified At» — после этого импорт OSM точку не меняет. Убрать точку с карты — дата в «Deleted At»
   (строки не удаляются). Новая точка — «Створити», источник «Додано вручну». Помощнику — пользователь с ролью «Модератор».

Что видит и может админка: только `places`; читать, добавлять, изменять. Удалять строки не может даже администратор —
это запрещено на уровне базы.

### Server operations
```bash
cd /opt/pet-app && docker compose ps
```
```bash
cd /opt/pet-app && docker compose logs --tail 100 api
```
Roll back to a previous image (tags are short commit hashes, the deploy keeps the last three):
```bash
docker images pet-app-api
```
```bash
docker tag pet-app-api:<hash> pet-app-api:latest && cd /opt/pet-app && docker compose up -d
```
