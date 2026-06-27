# Track Anime — Project Overview

## Purpose

Track Anime (`track-anime`) — веб-приложение для просмотра аниме с интеграцией Shikimori (списки, профиль, OAuth) и Kodik (плеер, озвучки, новые серии). Пользователи входят через Shikimori, смотрят аниме через встроенный Kodik-плеер, ведут прогресс просмотра и синхронизируют списки.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 3 |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma 6 |
| Images | sharp (cover cache) |
| Auth | Shikimori OAuth2 (custom, no NextAuth) |
| Video | Kodik iframe + postMessage API |
| Deploy | Node.js, nginx (see `docs/SERVER.md`) |

## Major Features

- **Home feed** — лента новых серий (`KodikEpisodeRelease`) с infinite scroll
- **History new episodes** — блок «новые серии из вашей истории» для авторизованных
- **Anime page** — метаданные Shikimori + выбор озвучки Kodik + плеер
- **Search** — поиск по локальной БД Kodik
- **Favorites / lists** — списки Shikimori (смотрю, в планах и т.д.) с локальным кэшем
- **Watch history** — прогресс просмотра (сезон, серия, позиция в секундах)
- **Calendar** — расписание выхода серий ongoing-аниме
- **User profiles** — публичные профили по Shikimori ID
- **Admin panel** — импорт Kodik, sync, настройки, DB explorer, todos

## High-Level Architecture

```
Browser
  └── Next.js App Router (RSC + client components)
        ├── API routes (/api/*)
        ├── Server lib (src/lib/*)
        └── PostgreSQL (Prisma)
              ├── Kodik materials, episodes, releases
              ├── Users, sessions, watch progress
              └── Shikimori list cache

Background / CLI:
  scripts/kodik-import-full.ts  — полный импорт каталога
  scripts/kodik-sync-recent.ts  — инкрементальный sync
  scripts/kodik-sync-scheduled.ts  — cron auto-sync
```

**Ключевой принцип:** фронтенд не обращается напрямую к Shikimori или Kodik API. Все внешние запросы идут через серверные модули (`src/lib/`, `src/kodik/`).

**Связь данных:** `Shikimori anime.id` = `Kodik shikimori_id` = ключ для страниц `/anime/[shikimoriId]`.

## Environment

См. `.env.example`: `DATABASE_URL`, `KODIK_API_TOKEN`, `SHIKIMORI_CLIENT_ID/SECRET`, `AUTH_URL`, `ADMIN_SHIKIMORI_IDS`.

## Related Docs

- `docs/shikimori-api/` — Shikimori API reference
- `docs/kodik-api/` — Kodik API reference
- `docs/KodikSyncDocumentation.md` — sync system details
- `docs/SERVER.md` — production deployment
