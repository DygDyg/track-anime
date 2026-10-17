# Раздел 8 — Документация

## 8.1. Новый API `/api/user/bookmarks`

Обновить:
- `CODEBASE_MAP.md` — секция `src/app/api/` → User routes
- `ARCHITECTURE.md` — если меняется data flow списков/закладок
- `BUSINESS_LOGIC.md` — flow «закладки» / отличие от `UserAnimeBookmark` (Shikimori favourites)
- `PROJECT_OVERVIEW.md` — Major Features, если user-visible
- `AI_CONTEXT.md` — Critical Paths (lists/favorites), если новый entrypoint
- При новой Prisma-модели — `prisma/schema.prisma` + schema quick ref в `AI_CONTEXT.md`

## 8.2. Смена формата `/api/releases`

Сломается / потребует правок:
- `src/components/ReleaseFeed.tsx` — infinite scroll, cursor parsing
- `src/app/page.tsx` — SSR initial page из того же shape
- Клиентский polling `live=1` consumers
- Типы DTO в `src/lib/releases.ts` / serialize helpers
- Возможно sessionStorage feed snapshot (`ta:feed:*`) в BUSINESS_LOGIC

Документы: `BUSINESS_LOGIC.md` § Home Feed, `ARCHITECTURE.md` releases, `CODEBASE_MAP.md` Content API, `AI_CONTEXT.md` home feed path.

## 8.3. Новый канал email

Код:
- `src/lib/notifications/channels/email.ts` (новый)
- dispatcher / worker wiring
- `UserNotificationPreferences` + возможно link model
- Admin notification settings + user preferences UI
- `.env.example` (SMTP credentials)

Документы:
- `BUSINESS_LOGIC.md` § Notifications
- `ARCHITECTURE.md` Integrations / Notifications
- `CODEBASE_MAP.md` notifications
- `AI_CONTEXT.md` env vars + Critical Paths
- `PROJECT_OVERVIEW.md` features
- возможно `docs/SERVER.md` ops

## 8.4. Новое поле в `KodikMaterial`

Шаги:
1. Изменить `prisma/schema.prisma`
2. `npx prisma migrate` / `db:push` (+ `prisma generate`)
3. Обновить `src/db/save-material.ts` (create/update mapping)
4. Обновить типы/DTO (`kodik/types` если из API; consumers)
5. Проверить admin debug / search SQL если поле участвует в выдаче
6. Docs: `AI_CONTEXT.md` Schema Quick Reference, `ARCHITECTURE.md` / `BUSINESS_LOGIC.md` при user-visible, `CODEBASE_MAP.md` если новый модуль, `docs/KodikSyncDocumentation.md` при влиянии на sync

## 8.5. Чеклист документации для PR `/settings`

- [ ] `CODEBASE_MAP.md` — страница `settings/` в App routes
- [ ] `PROJECT_OVERVIEW.md` — Site settings / новая страница (сейчас настройки часто modal/`/app`)
- [ ] `BUSINESS_LOGIC.md` — user-facing behavior, что хранится (account vs localStorage)
- [ ] `ARCHITECTURE.md` — если новые API / session settings flow
- [ ] `AI_CONTEXT.md` — Critical Path «site settings»
- [ ] `CONVENTIONS.md` — только если новый naming pattern
- [ ] API routes map, если есть `/api/user/site-settings` изменения
- [ ] `README.md` — только если меняется setup/навигация для разработчика
- [ ] Screenshots/QA notes в описании PR (не обязательно в repo docs)
