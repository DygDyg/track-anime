## 8.1
Если добавить `/api/user/bookmarks`, нужно обновить:
- `CODEBASE_MAP.md` — раздел `src/app/api/` / User routes, потому что это новый API route.
- `CONVENTIONS.md` только если меняется паттерн, иначе не обязательно.
- `BUSINESS_LOGIC.md` если у bookmarks есть user-visible flow/edge cases.
- `PROJECT_OVERVIEW.md` если bookmarks становятся major feature.
Основание: `CONVENTIONS.md:134-142`, `AI_RULES.md:88-102`.

## 8.2
Если поменять формат ответа `/api/releases`, затронется:
- route `src/app/api/releases/route.ts:32-59`;
- клиент `ReleaseFeed` (упомянут в `BUSINESS_LOGIC.md:25`);
- любые consumers `nextCursor/hasMore/items`, включая polling `live=1` contract — `src/app/api/releases/route.ts:39-56`;
- блок `history new episodes`, если он ожидает совместимость с `ReleaseItem`-подобной структурой, так как `src/lib/history-new-episodes.ts:17` расширяет `ReleaseItem`.

## 8.3
Если добавить канал email:
- Код:
  - `src/lib/notifications/types.ts`
  - `src/lib/notifications/worker.ts`
  - новый `src/lib/notifications/channels/email.ts`
  - user preferences / runtime config / dispatcher / test-send endpoints
- Prisma:
  - `NotificationSettings`
  - `UserNotificationPreferences`
  - возможно `UserNotificationLink`
- Документация:
  - `ARCHITECTURE.md` (integrations)
  - `PROJECT_OVERVIEW.md` (major feature list)
  - `BUSINESS_LOGIC.md` если меняется пользовательский flow
  - `docs/SERVER.md` и `.env.example` если нужны SMTP/env vars
Основание: `CONVENTIONS.md:134-142`.

## 8.4
Если меняется `KodikMaterial` schema:
1. Обновить `prisma/schema.prisma`.
2. Выполнить Prisma migration / `db:push` по принятому процессу.
3. Перегенерировать Prisma client (`postinstall: prisma generate`, `CONVENTIONS.md:125`).
4. Обновить код, который читает/пишет это поле, в первую очередь `src/db/save-material.ts`, `src/lib/anime-page.ts`, `src/lib/search.ts`, `src/lib/releases.ts` по необходимости.
5. Проверить docs:
  - `ARCHITECTURE.md`
  - `CODEBASE_MAP.md`
  - feature docs, если поле влияет на поведение
Основание: `AGENTS.md` и `CONVENTIONS.md:134-142`.

## 8.5
Checklist docs для новой страницы `/settings`:
- `CODEBASE_MAP.md` — новый page route.
- `PROJECT_OVERVIEW.md` — если страница становится важной feature entrypoint.
- `BUSINESS_LOGIC.md` — если есть новые пользовательские flow/edge cases.
- `ARCHITECTURE.md` — если появляются новые loaders/API/settings data flow.
- `CONVENTIONS.md` — только если страница вводит новый pattern.
- `.env.example` / `docs/SERVER.md` — только если есть новые env/runtime requirements.
