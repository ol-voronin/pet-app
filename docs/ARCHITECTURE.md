# Architecture

## Принципы
- Модульный монолит на TypeScript. Модули изолированы, чтобы позже вынести любой в сервис.
- Одна БД (PostgreSQL + PostGIS). Тяжёлая работа — в воркерах через очередь.
- Офлайн-first для медкарты (блэкауты), онлайн для карты и событий.
- Хостинг в ЕС (GDPR, устойчивость), бэкапы в двух регионах.

## Компоненты
```
apps/mobile (Expo) ─┐
apps/web (Next.js) ─┼─► apps/api (REST + OpenAPI) ─► Postgres+PostGIS (Neon)
admin (Directus)  ──┘          │                    ├► R2 (документы, фото)
                               └► Redis/BullMQ ─► workers ─► LLM/OCR, FCM/APNs, Viber/SMS
```

## Модули API
| Модуль | Ответственность |
|---|---|
| auth | OTP по телефону (Viber → SMS fallback), Apple/Google, JWT access + refresh, роли |
| pets | Питомцы, семейный доступ (owner/editor/viewer), чип, № госреестра, вес |
| health | Медзаписи: vaccination, treatment, visit, lab, medication, note; source + version |
| documents | Загрузка по presigned URL, статусы, пайплайн OCR, извлечённые поля |
| reminders | Правила-графики, планировщик, пуши |
| places | Точки карты, гео-поиск, векторные тайлы, claim, отзывы (V2) |
| events | V2: события, RSVP, билеты, чек-ин |
| payments | V2: эквайринг (mono/WayForPay), RevenueCat webhooks, пРРО (Checkbox) |
| partners | V3: публичный API и вебхуки для CRM клиник, OAuth2 |

## Пайплайн распознавания документа
1. Клиент: сканер (VisionKit / ML Kit) → сжатие ~1600 px → `POST /documents` → presigned URL → загрузка в R2.
2. API ставит задачу `ocr.extract` в очередь.
3. Воркер: мультимодальная LLM со строгой JSON-схемой (zod → JSON Schema) → поля + confidence.
4. Нормализация препаратов и вакцин по справочнику (`packages/shared/dictionaries`).
5. Статус `needs_review` → пуш пользователю → экран подтверждения → создание медзаписей с `source=ocr`.
6. Хранить: оригинал, сырой ответ модели, версию промпта/модели, итоговые записи.

## Мобильное приложение
- expo-router (табы: Карта · Питомцы · События · Профиль), TanStack Query, Zustand + MMKV.
- Офлайн: expo-sqlite + Drizzle; синхронизация — PowerSync (см. ADR-0003).
- Карта: @maplibre/maplibre-react-native, тайлы MapTiler, точки — векторные тайлы из PostGIS.
- Пуши: expo-notifications; локальные напоминания планируются на устройстве.
- Покупки: RevenueCat. Билеты: внешняя оплата через expo-web-browser.
- Наблюдаемость: Sentry, PostHog (EU).

## Инфраструктура
| Что | Где |
|---|---|
| БД | Neon (PostgreSQL + PostGIS), регион EU |
| API + воркеры | Fly.io или Render (EU) |
| Файлы | Cloudflare R2 (приватный бакет) |
| Очередь/кэш | Upstash Redis |
| B2B-кабинет | Vercel |
| Сборки | EAS Build / Submit / Update |
| CI | GitHub Actions: typecheck, lint, test на каждый PR |

## Безопасность
- Закон Украины о защите персональных данных + GDPR: отдельные согласия (геолокация, маркетинг), удаление аккаунта в приложении.
- RBAC на уровне API; аудит-лог доступа к медкарте.
- QR для клиники — временный токен (24 ч), только чтение, краткая карта.
- Секреты — только в переменных окружения, никогда в репозитории.

## ADR (журнал решений)
Файлы в `docs/adr/`. Первые решения, которые нужно зафиксировать:
- 0001 — Монорепо pnpm + Turborepo (принято)
- 0002 — Fastify vs NestJS для API (принято: Fastify)
- 0003 — PowerSync vs своя синхронизация
- 0004 — Провайдер OCR/LLM
- 0005 — MapLibre + MapTiler vs Mapbox
