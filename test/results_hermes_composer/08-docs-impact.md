# Раздел 8 — Документация (impact)

## 8.1
Новый API `/api/user/bookmarks`:
| Документ | Зачем |
|---|---|
| `CODEBASE_MAP.md` | секция `src/app/api/` / user routes |
| `BUSINESS_LOGIC.md` | user-visible flow закладок, edge cases |
| `PROJECT_OVERVIEW.md` | если major feature в списке возможностей |
| `ARCHITECTURE.md` | если новый data flow / auth pattern |
| `CONVENTIONS.md` | **только** если новый pattern (обычно нет) |
| `AI_CONTEXT.md` / `AGENTS.md` | если инвариант для агентов |

Основание: `CONVENTIONS.md` documentation impact; `AI_RULES.md`.

## 8.2
Смена формата `/api/releases`:
**Сломается:**
- `src/app/api/releases/route.ts` contract
- `src/components/ReleaseFeed.tsx` (items, nextCursor, hasMore, live polling merge)
- `src/components/ReleaseCard.tsx` / hover panels (поля DTO)
- SSR `src/app/page.tsx` initial props
- Типы `ReleaseItem` в `releases.ts` / consumers
- `history-new-episodes` если шарит shape `ReleaseItem`-like (`history-new-episodes.ts`)

Docs: `BUSINESS_LOGIC.md` (home feed), `CODEBASE_MAP.md`, возможно `ARCHITECTURE.md` caching tags `releases`.

## 8.3
Новый канал email:
**Код:**
- `src/lib/notifications/types.ts` (`NotificationChannelId`)
- `src/lib/notifications/worker.ts` + dispatcher
- новый `src/lib/notifications/channels/email.ts`
- prefs UI + API user notification settings
- test-send admin endpoint

**Prisma:** `NotificationSettings`, `UserNotificationPreferences`, возможно link model.

**Docs/ops:**
- `ARCHITECTURE.md`, `PROJECT_OVERVIEW.md`, `BUSINESS_LOGIC.md`
- `.env.example` (SMTP_*)
- `docs/SERVER.md` (runtime worker)

## 8.4
Новое поле в `KodikMaterial`:
1. Править `prisma/schema.prisma`.
2. `npm run db:push` или migration (процесс проекта).
3. `prisma generate` (postinstall).
4. Обновить writers/readers: **`src/db/save-material.ts`**, `src/lib/anime-page.ts`, `src/lib/search.ts`, `src/lib/releases.ts`, admin DB explorer mapping.
5. Types Kodik mapping если поле из API — `src/kodik/types.ts`.
6. Docs: `ARCHITECTURE.md` / `CODEBASE_MAP` / feature docs при user-visible change.
7. Backfill script при необходимости (`scripts/`).

## 8.5
Чеклист docs для PR «новая страница `/settings`»:
- [ ] `CODEBASE_MAP.md` — page path + related API
- [ ] `PROJECT_OVERVIEW.md` — major features (если user entrypoint)
- [ ] `BUSINESS_LOGIC.md` — flows / defaults / edge cases
- [ ] `ARCHITECTURE.md` — loaders, storage, cache
- [ ] API routes list / auth notes
- [ ] `CONVENTIONS.md` — только new pattern
- [ ] `.env.example` / `docs/SERVER.md` — если env
- [ ] UI screenshots / admin vs user settings границы
- [ ] Проверить, нет ли уже `/app` settings — не дублировать без docs note
- [ ] AGENTS/AI_CONTEXT — если новый инвариант
