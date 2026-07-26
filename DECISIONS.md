# Track Anime — Architecture decisions

Краткий журнал решений для AI и разработчиков. Подробности — в коде и `AI_CONTEXT.md`.

## Routing & middleware

- **`src/proxy.ts`** — только redirect `?shikimori_id=` → `/anime/{id}`. Auth не в proxy.
- **URL-ключ аниме** — `shikimoriId`, не внутренний id БД.

## Posters / covers

- **Карточки и превью** — `size="thumb"` → `/api/cover?id=&size=thumb` (320px, q≈68), см. `poster.ts`, `cover-cache.ts`.
- **Lightbox / полный просмотр** — full image, не thumb.

## Shikimori lists sync

| Действие | Shikimori | Локально TA |
|----------|-----------|-------------|
| **+1 пересмотр** (`rewatch: true`) | PATCH `user_rates`, `rewatches++` | из ответа API |
| **Ручной rewatches** в избранном | не отправляется | только Prisma |
| **Sync pull** (update) | status, score, episodes, dates | **`rewatches` не перезаписывается** на update |
| **Watch progress** (Kodik) | не синхронизируется | `UserWatchProgress` |

## Deploy

- Prod: `https://ta.dygdyg.ru/`, сервер `root@195.26.230.35`, `/var/www/ta_new`.
- Локально: `.\scripts\deploy.ps1` (сборка на сервере). См. `docs/DEPLOY.md`.

## AI workflow

- Мультитемные запросы — rule `.cursor/rules/multi-task-dispatcher.mdc`, skill `ta-dispatcher` (есть в репо).
- Cursor always-on — `.cursor/rules/track-anime-core.mdc`, `codex-ported-preferences.mdc` (предпочтения из Codex memories).
- Быстрый контекст — `AI_CONTEXT.md`; правила разработки — `AI_RULES.md` / `AGENTS.md` / `.cursorrules`.
