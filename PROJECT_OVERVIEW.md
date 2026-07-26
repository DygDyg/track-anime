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
- **Anime page** — метаданные Shikimori с явным типом тайтла + выбор озвучки Kodik + плеер с ручным и автоматическим OP/ED skip
- **Search** — поиск по локальной БД Kodik с неточными совпадениями по названию, адаптивными полноширинными карточками результатов и настраиваемой задержкой подсказок в шапке
- **Favorites / lists** — списки Shikimori (смотрю, в планах и т.д.) с локальным кэшем
- **Watch history** — прогресс просмотра (сезон, серия, позиция в секундах)
- **Calendar** — расписание выхода серий ongoing-аниме с переключением между локальным Kodik-source и Shikimori calendar, плюс анонсы
- **Совместный просмотр TA-плеера** — настраиваемые в админке ephemeral WebSocket-комнаты с invite-ссылкой, списком участников, гостевыми случайными именами, передачей мастера и правами участников
- **User profiles** — публичные профили по Shikimori ID и поиск пользователей Shikimori из профиля текущего пользователя
- **Site settings** — настройки внешнего вида, часов, ленты, плеера, локального ТВ-режима и украшений аватарок для авторизованных; общая страница `/app` и вкладка настроек для загрузки Android APK по кнопке или QR-коду и версии из манифеста релиза; админская ротация WEBP-логотипов из `public/brand-logos`; «Недавно открытые» доступны отдельной иконкой рядом с поиском; глобальная кнопка «Наверх» возвращает к началу длинных страниц, а на touch-устройствах жест вниз от верхней границы обновляет текущую страницу
- **Notifications** — browser push, in-app лента и внешние каналы Discord/Telegram/VK через пользовательские привязки
- **Admin panel** — импорт Kodik, sync, уведомления, search/site defaults, DB explorer, todos

## High-Level Architecture

```
Browser
  └── Next.js App Router (RSC + client components)
        ├── API routes (/api/*)
        ├── Server lib (src/lib/*)
        └── PostgreSQL (Prisma)
              ├── Kodik materials, episodes, releases
              ├── Users, sessions, watch progress
              ├── Shikimori list cache
              ├── Notification preferences, links, deliveries
              └── External ID / skip-time cache

Background / CLI:
  scripts/kodik-import-full.ts  — полный импорт каталога
  scripts/kodik-sync-recent.ts  — инкрементальный sync
  scripts/kodik-sync-scheduled.ts  — cron auto-sync
  scripts/notification-worker.ts  — доставка уведомлений
  scripts/watch-party-server.mjs  — WebSocket-комнаты совместного просмотра
```

**Ключевой принцип:** фронтенд не обращается напрямую к Shikimori или Kodik API. Все внешние запросы идут через серверные модули (`src/lib/`, `src/kodik/`).

**Связь данных:** `Shikimori anime.id` = `Kodik shikimori_id` = ключ для страниц `/anime/[shikimoriId]`.

## Environment

См. `.env.example`: `DATABASE_URL`, `KODIK_API_TOKEN`, `SHIKIMORI_CLIENT_ID/SECRET`, `AUTH_URL`, `ADMIN_SHIKIMORI_IDS`.

## Related Docs

- `AGENTS.md` — Codex rules and project invariants
- `AI_RULES.md` / `AI_CONTEXT.md` — shared AI rules and quick reference for Codex/Cursor
- `docs/shikimori-api/` — Shikimori API reference
- `docs/kodik-api/` — Kodik API reference
- `docs/aniskip-api.md` — AniSkip API reference
- `docs/KodikSyncDocumentation.md` — sync system details
- `docs/SERVER.md` — production deployment
