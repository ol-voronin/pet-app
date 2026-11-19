# Data model (MVP)

Черновик. Claude Code: превратить в схему Drizzle в `packages/db`, задать вопросы, если что-то противоречит PRD.

## Сущности

### users
id, phone (unique), name, avatar_url, locale (`uk`|`en`), created_at, deleted_at

### pets
id, name, species (`dog`|`cat`|`other`), breed, sex, birth_date, color, sterilized,
chip_number, registry_number, tag_number, photo_url, notes, hidden, created_at, updated_at

### pet_members — доступ к питомцу
pet_id, user_id, role (`owner`|`editor`|`viewer`), invited_by, created_at

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

### documents
id, pet_id, uploaded_by, storage_key, mime, pages, status
(`uploaded`|`processing`|`needs_review`|`confirmed`|`failed`),
doc_type (detected), model, prompt_version, raw_extraction (jsonb), created_at

### extracted_fields
id, document_id, target_type, field, value, confidence, bbox (jsonb), accepted (bool|null)

### reminders
id, pet_id, health_record_id (nullable), kind, due_at, rule (jsonb), status
(`scheduled`|`sent`|`done`|`snoozed`|`cancelled`), created_by

### places
id, category (`clinic`|`pharmacy`|`dog_park`|`cafe`|`groomer`|`shop`),
name, geom (geography Point), address, city, phone, website, hours (jsonb),
attributes (jsonb: off_leash, fenced, 24_7…), source (`osm`|`manual`|`claimed`),
osm_id, verified_at, claimed_by_org_id (V2)

### dictionaries (справочники)
vaccines, products (препараты и средства от паразитов) — id, name_uk, aliases[], manufacturer

## Правила
- Мягкое удаление (`deleted_at`) для всего медицинского; физически ничего не удаляем, кроме запроса на удаление аккаунта.
- При изменении записи — `version + 1`; старую версию сохраняем в `health_record_versions`.
- Индексы: GIST по `places.geom`; (pet_id, date) по `health_records`; (due_at, status) по `reminders`.
