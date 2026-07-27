## 1.1
Стек:
- Framework: Next.js 16 App Router, React 19, Tailwind CSS 3, TypeScript 5 — `PROJECT_OVERVIEW.md:11-18`.
- DB/ORM: PostgreSQL 16 + Prisma 6 — `PROJECT_OVERVIEW.md:14-15`, `ARCHITECTURE.md:20-24`.
- External APIs: Shikimori public/user/OAuth, Kodik API, AniSkip — `ARCHITECTURE.md:106-119`.
- Auth: кастомный Shikimori OAuth2 без NextAuth + локальный пароль + QR login — `PROJECT_OVERVIEW.md:17`, `ARCHITECTURE.md:36-58`.
- Конфиги: `next.config.ts`, `prisma/schema.prisma`, `src/lib/auth/config.ts`, `.env.example` упомянут в `PROJECT_OVERVIEW.md:62-65`.

## 1.2
Схема данных:
- `Shikimori anime.id === Kodik shikimori_id === /anime/[shikimoriId]` — доменный ключ, `BUSINESS_LOGIC.md:5-14`.
- `KodikMaterial`: один Kodik-материал = одно аниме + одна озвучка, поля `kodikId`, `shikimoriId`, `translationId`, `translationTitle`, `playerLink` — `prisma/schema.prisma:187-222`.
- `UserWatchProgress`: хранит прогресс по `(userId, shikimoriId)`, плюс `kodikId`, `seasonNumber`, `episodeNumber`, `positionSeconds` — `prisma/schema.prisma:504+`, фактический upsert по composite key в `src/lib/watch-history.ts:334-355`.
- `AnimeExternalIdMap`: mapping `shikimoriId -> malId` для серверных интеграций — `prisma/schema.prisma:39-47`.
- Связи: `KodikMaterial.shikimoriId` связывает Kodik с Shikimori; `UserWatchProgress.shikimoriId` ссылается на доменный ключ; `AnimeExternalIdMap` дополняет тот же `shikimoriId`.

## 1.3
Пайплайн Kodik -> DB:
1. Kodik client: `src/kodik/client.ts` — указан в `ARCHITECTURE.md:67-69,115`.
2. Full import: `scripts/kodik-import-full.ts` — `PROJECT_OVERVIEW.md:50-55`, `ARCHITECTURE.md:72-75`.
3. Incremental sync: `src/lib/admin/kodik-sync.ts` — `ARCHITECTURE.md:76-79`.
4. Сохранение материала: `saveKodikMaterial()` в `src/db/save-material.ts:71-176`.
5. Сохранение сезонов/серий: `saveSeasonsAndEpisodes()` — `src/db/save-material.ts:179-252`.
6. Создание релиза для home feed: `trackLatestRelease()` -> `prisma.kodikEpisodeRelease.create()` — `src/db/save-material.ts:274-317`.

## 1.4
Разделение server/client:
- Правило: фронтенд не ходит напрямую в Shikimori/Kodik; внешние запросы идут через server modules — `PROJECT_OVERVIEW.md:58-60`, `AGENTS.md`/`AI_CONTEXT.md`.
- Server examples: `src/lib/search.ts`, `src/lib/anime-page.ts`, `src/app/api/search/route.ts`.
- Client examples: `src/components/anime/AnimeWatchPanel.tsx`, `src/components/anime/KodikPlayer.tsx`, `src/hooks/useWatchParty.ts`.
- Convention: page/server components по умолчанию, interactive UI через `"use client"` — `CONVENTIONS.md:33-40`.

## 1.5
App Router:
- Pages: `src/app/**/page.tsx`, API routes: `src/app/api/**/route.ts` — `CODEBASE_MAP.md:25-80`, `CONVENTIONS.md:10-11`.
- Dynamic page segments, подтверждённые кодом:
  - `src/app/anime/[shikimoriId]/page.tsx` — страница аниме.
  - `src/app/user/[shikimoriId]/page.tsx` — публичный профиль.
  - `src/app/user/[shikimoriId]/favorites/page.tsx` — список избранного пользователя.
- Dynamic API segments встречаются, например: `src/app/api/user/watch-history/[shikimoriId]/route.ts`, `src/app/api/admin/todos/[id]/route.ts`, `src/app/api/admin/anime/[shikimoriId]/skip-times-prefetch/route.ts`.

## 1.6
Кэширование:
- Home feed cache: `getRecentReleasesPage()` использует `unstable_cache(..., { revalidate: RELEASES_FEED_CACHE_SECONDS, tags: ["releases"] })` — `src/lib/releases.ts:570-577`.
- Live polling bypass cache: `getRecentReleasesPageLive()` — `src/lib/releases.ts:580-582`.
- Cover cache: `/api/cover` с fresh/stale отдачей и background refresh — `ARCHITECTURE.md:136-140`, `src/app/api/cover/route.ts:115-149`.
- Shikimori anime cache в БД с TTL + background refresh — `ARCHITECTURE.md:148-151`.
- Brand logo list cache 30s in-memory — `src/lib/brand-rotation.ts:29-30,47-89`.
- Watch party settings cache 30s in-memory — `src/lib/admin/watch-party-settings.ts:36-38,76-96`.

## 1.7
Нотификации:
- Каналы: `browser`, `telegram`, `vk`, `discord` — `src/lib/notifications/types.ts:4,43-47`.
- Worker/dispatch: `scripts/notification-worker.ts` указан в `PROJECT_OVERVIEW.md:50-55`; процессинг доставок в `src/lib/notifications/worker.ts:56-144`.
- Channel senders: `src/lib/notifications/channels/browser.ts`, `telegram.ts`, `vk.ts`, `discord.ts`.
- In-app feed тоже есть как отдельный слой: `src/lib/notifications/in-app-feed.ts`, `PROJECT_OVERVIEW.md:33`.

## 1.8
Brand rotation:
- Это ротация WEBP-логотипов из `public/brand-logos` — `ARCHITECTURE.md:142-146`.
- Активный логотип выбирается детерминированно по временному слоту и seed — `src/lib/brand-rotation.ts:91-130`.
- Основные файлы: `src/lib/brand-rotation.ts`, `src/lib/admin/brand-rotation-settings.ts`, `src/app/api/brand/logo/route.ts`, `src/app/api/brand/icon/route.ts`, `src/app/api/brand/favicon/route.ts`, `src/components/admin/BrandRotationSettingsPanel.tsx`.

## 1.9
Cover/poster proxy:
- URL строится как `/api/cover?id=<shikimoriId>` или `size=thumb` — `src/lib/poster.ts:10-16`.
- Route handler: `src/app/api/cover/route.ts:75-205`.
- Цепочка: fresh cache -> stale cache + background refill -> quick direct source redirect -> full fetch/cache -> direct fallback -> 404 — `src/app/api/cover/route.ts:32-72,115-197`.
- Poster resolution helpers: `src/lib/poster.ts`, `src/lib/poster-fallback.ts`, `src/lib/cover-cache.ts`, `src/lib/material-poster.ts`.

## 1.10
Watch party:
- Client hook: `src/hooks/useWatchParty.ts` — WebSocket, invite URL, guest identity, permissions — `1-33`, `79-128`, `243-320+`.
- Runtime settings API: `/api/settings/watch-party` -> `src/app/api/settings/watch-party/route.ts:1-9`.
- Server: `scripts/watch-party-server.mjs`.
- Комнаты in-memory, state-sync каждые 2 секунды, heartbeat 30 секунд — `scripts/watch-party-server.mjs:6-12`.
- Мастер: первый участник становится мастером — `scripts/watch-party-server.mjs:198-211`.
- Передача роли: при выходе мастера следующий участник получает роль — `scripts/watch-party-server.mjs:214-231`.
- Протокол: `join`, `leave`, `presence`, `request-sync`, `play`, `pause`, `seek`, `episode`, `translation`, `state-sync`, `set-permissions` — `scripts/watch-party-server.mjs:152-160,243-340`.
