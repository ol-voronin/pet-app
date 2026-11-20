# Data model (MVP)

Синхронизировано с `docs/PRD.md` (решения от 19.11.2026) и `HANDOFF.md` §9. Реализовано в `packages/db`
по мере появления фич: сейчас есть `users`, `auth_identities`, `sessions`, `otp_challenges` (миграции `0001`–`0002`).
Пометка **(V2)** — таблица нужна, но не в MVP.

## Аккаунт

### users
id (uuid), phone (nullable, unique), name, avatar_url, locale (`uk`|`en`), created_at, deleted_at

`phone` необязателен: при входе через Apple/Google телефона может не быть.

### auth_identities — способы входа
id, user_id, provider (`phone`|`apple`|`google`), subject (телефон в E.164 или `sub` провайдера),
email (nullable), created_at, last_used_at · unique (provider, subject)

### sessions — refresh-сессии
id, user_id, refresh_token_hash (HMAC, сам токен не хранится), family_id, device_name, created_at, expires_at, revoked_at

Refresh-токен меняется при каждом обновлении; все сессии одного входа делят `family_id`. Повторное
использование старого токена отзывает всю семью (признак кражи).

### otp_challenges — одноразовые коды
id, phone (E.164), code_hash (HMAC, привязан к телефону), attempts, created_at, expires_at, consumed_at

Код — 6 цифр, живёт 5 минут, 5 попыток; не чаще 1 кода в 60 с и 3 кодов за 10 минут на номер.

### devices — push-токены
id, user_id, platform (`ios`|`android`), push_token (unique), app_version, locale, last_seen_at, created_at

### consents — согласия
id, user_id, kind (`privacy_policy`|`geolocation`|`marketing`), version, granted (bool), created_at

## Питомцы и доступ

### pets
id, name, species (`dog`|`cat`|`other`), breed, sex (`male`|`female`, nullable), birth_date (date), color, sterilized,
chip_number, registry_number, tag_number, notes, hidden, created_at, updated_at, deleted_at,
**avatar** (jsonb, nullable), **avatar_key** (nullable — готовый рендер), **photo_key** (nullable),
**hero** (`avatar`|`photo`, default `avatar`)

`avatar_key` и `photo_key` — ключи объектов в приватном бакете (ADR-0006). Ссылок в БД нет: API подписывает
ссылку при чтении. Реализовано: миграция `0003_pets` (`pets`, `pet_members`).

`avatar` для MVP — только собака и кошка:
`{ species, ears, muzzle, coat, color, render_version }`. Собирается автоматически по виду и породе,
владелец правит в конструкторе. В QR-паспорте показывается фото, если оно есть.

### pet_members — доступ к питомцу
pet_id, user_id, role (`owner`|`editor`|`viewer`), invited_by, created_at · PK (pet_id, user_id)

Лимит Free — 2 участника на питомца, включая владельца. Проверяется при создании и принятии приглашения;
при окончании Plus существующие участники не удаляются, блокируются только новые приглашения.

### pet_invites — приглашения по ссылке
id, token_hash (unique), role (`editor`|`viewer`), created_by, created_at, expires_at,
accepted_by (nullable), accepted_at (nullable), revoked_at (nullable)

### pet_invite_pets — питомцы приглашения
invite_id, pet_id · PK (invite_id, pet_id)

- Одно приглашение — для одного человека и может охватывать нескольких питомцев (решение от 20.11.2026).
- Ссылка живёт 72 часа; в БД хранится только хэш токена. Приглашает только владелец.
- Лимит проверяется по каждому питомцу при создании и при принятии. Если у одного из питомцев места нет,
  приглашение не принимается целиком. Удалённый питомец пропускается.
- Отзыв доступа: владелец удаляет участника из `pet_members`; неиспользованную ссылку можно отменить (`revoked_at`).
- Реализовано: миграция `0004_family`.

## Медкарта

### health_records — единая таблица медзаписей
id, pet_id, type (`vaccination`|`treatment`|`visit`|`lab`|`medication`|`note`|`weight`),
date, title, details (jsonb — поля, зависящие от type),
source (`manual`|`ocr`|`clinic`), source_document_id (nullable),
clinic_name, vet_name, next_due_date (nullable),
version, created_by, created_at, updated_at, deleted_at

`details` по типам:
- vaccination: vaccine_name, vaccine_normalized_id, batch, against[] (rabies, dhppi…)
- treatment: kind (`flea_tick`|`deworming`), product, product_normalized_id
- medication: drug, dose, frequency, start_date, end_date
- lab: test_name, results[] {name, value, unit, ref_min, ref_max, flag}
- visit: reason, diagnosis_text, recommendations
- weight: value_kg
- note: text

Текущий вес питомца — последняя запись `weight`, отдельного поля у `pets` нет.

### health_record_versions — история изменений
id, health_record_id, version, snapshot (jsonb — запись целиком до изменения), changed_by, changed_at
· unique (health_record_id, version)

### documents
id, pet_id, uploaded_by, storage_key, filename, mime, size_bytes, pages,
kind (`scan`|`file`), status
(`stored`|`uploaded`|`processing`|`needs_review`|`confirmed`|`failed`),
doc_type (detected), model, prompt_version, raw_extraction (jsonb), created_at, deleted_at

- `stored` — файл загружен как есть, без распознавания. Распознавание можно запустить позже по желанию (тратит скан).
- Допустимые типы: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`.
- Лимит размера: 20 МБ на файл. Хранение лимитом сканов не ограничено.

### extracted_fields
id, document_id, target_type, field, value, confidence, bbox (jsonb), accepted (bool|null)

### scan_usage — лимит AI-сканов
user_id, period (`YYYY-MM`, по `Europe/Kyiv`), count · PK (user_id, period)

Лимит Free — 5 в месяц. Исчерпание лимита блокирует только новые распознавания, никогда — историю и файлы.

## Напоминания

### reminders
id, pet_id, health_record_id (nullable), kind
(`vaccination`|`treatment`|`medication`|`visit`|`grooming`|`nails`|`food`|`custom`),
title (для `custom`), needs_specialist (bool), place_id (nullable — где делать / куда звонить),
due_at, remind_before (interval), rule (jsonb — повтор), appointment_at (nullable — дата записи),
status (`scheduled`|`sent`|`done`|`snoozed`|`cancelled`), created_by, created_at

- `needs_specialist = true` (прививка, укол, визит, груминг) → кнопки «Записаться» + «Уже сделано».
  «Записаться» = звонок в клинику из последнего визита или выбор места на карте; после звонка — дата записи
  в `appointment_at` и перенос `due_at`.
- `needs_specialist = false` (обработка, лекарство, корм) → кнопка «Сделано».
- Произвольные напоминания не привязаны к медзаписи (`health_record_id = null`).

## Карта

### places
Реализовано в `packages/db/src/schema/places.ts` (миграция `0005_places`).

id, category (`clinic`|`pharmacy`|`dog_park`|`shop`|`groomer`|`trainer`|`cafe`|`other`),
name (может быть пустым — у многих площадок нет названия), names (jsonb: `default`, `uk`, `ru`, `en` — для поиска),
lat, lon, geom (geography Point — вычисляется из lat/lon), address, city, phones (text[], E.164), website,
opening_hours (строка в формате OSM), attributes (jsonb: open247, emergency, fenced),
source (`osm`|`manual`|`user`; `claimed` появится с B2B), osm_type + osm_id (уникальная пара), osm_tags (jsonb,
теги на момент последнего импорта), osm_seen_at, osm_missing_since, **verified_at**, verified_by,
**visibility** (`public`|`private`), **created_by** (nullable — для `source=user`),
**moderation_status** (`approved`|`pending`|`rejected`), claimed_by_org_id (V2)

- Своя метка пользователя: `source=user`, по умолчанию `visibility=private` — видна автору и членам семьи
  его питомцев сразу, без модерации.
- Публичная метка пользователя показывается всем только при `moderation_status=approved`.
- Точки из OSM и ручные — `public` + `approved`.
- **Импорт OSM** (`pnpm -F api osm:import`, раз в неделю): непроверенную точку обновляет; проверенную человеком
  (`verified_at` заполнен) не меняет, только кладёт рядом свежие `osm_tags`; пропавшую из OSM помечает
  `osm_missing_since` и не удаляет. Google Places источником быть не может.

### organizations (V2)
id, name, kind (`clinic`|`pharmacy`|`organizer`), created_at — для `places.claimed_by_org_id` и B2B-кабинета.

## Справочники
vaccines, products (препараты и средства от паразитов) — id, name_uk, aliases[], manufacturer

## Аудит

### audit_log
id, actor_user_id, action (`health.read`|`health.write`|`qr.open`|…), pet_id (nullable),
target_id (nullable), ip (nullable), created_at

## Правила
- Мягкое удаление (`deleted_at`) для всего медицинского; физически ничего не удаляем, кроме запроса на удаление аккаунта.
- При изменении записи — `version + 1`; старую версию сохраняем в `health_record_versions`.
- Все даты — `timestamptz` в UTC; месяц лимита сканов считается по `Europe/Kyiv`.
- Индексы: GIST по `places.geom`; (pet_id, date) по `health_records`; (due_at, status) по `reminders`;
  (moderation_status) по `places` где `visibility=public` и `source=user`.
