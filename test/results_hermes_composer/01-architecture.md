# Раздел 1 — Архитектура

## 1.1
Стек:
- **Framework / UI:** Next.js 16 (App Router), React 19, Tailwind CSS 3, TypeScript 5 — `package.json` (`next`, `react`), `PROJECT_OVERVIEW.md:11-18`, `README.md:65-73`.
- **DB / ORM:** PostgreSQL 16 + Prisma 6 — `docker-compose.yml`, `prisma/schema.prisma`, `@prisma/client` в `package.json`.
- **Внешние API:** Shikimori (OAuth + API), Kodik API, AniSkip — `ARCHITECTURE.md`, клиенты `src/lib/shikimori/*`, `src/kodik/*`, `src/lib/aniskip.ts`.
- **Auth:** кастомный Shikimori OAuth2 (без NextAuth) + local credentials + QR login — `src/lib/auth/*`, `src/app/api/auth/*`.
- **Прочее:** sharp (обложки), web-push, ws (watch party), Serwist (PWA).
- **Конфиги:** `next.config.ts`, `prisma/schema.prisma`, `tsconfig.json` (`@/*`), `.env.example`, `src/lib/auth/config.ts` (если присутствует).

## 1.2
Схема данных (текстом):

```
Shikimori anime.id  ═══  Kodik shikimori_id  ═══  /anime/[shikimoriId]
         │                        │
         │                        ├── KodikMaterial (kodikId PK, shikimoriId?, translationId, …)
         │                        │         └── seasons/episodes / KodikEpisodeRelease
         │                        │
         ├── AnimeExternalIdMap (shikimoriId PK → malId?)
         └── UserWatchProgress (@@unique [userId, shikimoriId]; kodikId как «последняя озвучка»)
```

Ключевые поля:
- `KodikMaterial`: `kodikId` @id, `shikimoriId?`, `translationId/Title/Type`, `title`, `playerLink`, `materialData` — `prisma/schema.prisma:306+`.
- `UserWatchProgress`: `userId`, `shikimoriId`, `kodikId?`, season/episode/position — unique `(userId, shikimoriId)` — `prisma/schema.prisma:642+`, `@@unique` ~654.
- `AnimeExternalIdMap`: `shikimoriId` @id, `malId?` — `prisma/schema.prisma:81-89`.
- Доменный ключ страниц: `shikimoriId`, не `kodikId` — `PROJECT_OVERVIEW.md:58-60`.

## 1.3
Цепочка Kodik API → БД:
1. HTTP-клиент Kodik: `src/kodik/client.ts`.
2. Полный импорт: `scripts/kodik-import-full.ts` (`npm run kodik:import`).
3. Инкрементальный sync: `scripts/kodik-sync-recent.ts` / `src/lib/admin/kodik-sync.ts` (`runKodikIncrementalSync`).
4. Сохранение материала: `saveKodikMaterial()` — `src/db/save-material.ts:110+`.
5. Сезоны/серии: внутренняя `saveSeasonsAndEpisodes()` — `src/db/save-material.ts:231+`.
6. Релиз для ленты: `trackLatestRelease()` → `prisma.kodikEpisodeRelease.create()` — `src/db/save-material.ts:326+`, create ~354.
7. Состояние job/run: `KodikImportJob`, `KodikSyncRun` — schema ~270, ~287.

## 1.4
**Правило:** браузер не вызывает Shikimori/Kodik напрямую; только server modules и `/api/*` — `PROJECT_OVERVIEW.md:58-60`, `AGENTS.md` / `AI_CONTEXT.md`.

Server (примеры):
- `src/lib/search.ts` (`import "server-only"`)
- `src/lib/anime-page.ts`
- `src/app/api/search/route.ts`
- `src/db/save-material.ts`, `src/kodik/client.ts`

Client (примеры):
- `src/components/anime/AnimeWatchPanel.tsx` (`"use client"`)
- `src/components/anime/KodikPlayer.tsx`
- `src/hooks/useWatchParty.ts`
- `src/components/ReleaseFeed.tsx`

## 1.5
App Router: pages `src/app/**/page.tsx`, API `src/app/api/**/route.ts`.

Dynamic **page** segments (подтверждены):
- `anime/[shikimoriId]` — страница аниме
- `user/[shikimoriId]` (+ `favorites`) — профиль / списки
- `serwist/[path]` — SW

Dynamic **API** segments (примеры):
- `api/user/watch-history/[shikimoriId]`
- `api/user/anime-lists/[shikimoriId]`
- `api/user/friends/[shikimoriId]`, `friends/incoming/[shikimoriId]`
- `api/anime/[shikimoriId]/*` (skip-times и др.)
- `api/admin/anime/[shikimoriId]/…`
- `api/admin/todos/[id]`
- `api/characters/[characterId]`
- `api/bg/[file]`

Также есть статические маршруты: `/`, `/search`, `/calendar`, `/history`, `/login`, `/admin`, `/app`, `/favorites` (redirect), `/players`, и т.д.

## 1.6
Кэширование:
- **Home feed:** `getRecentReleasesPage` → `unstable_cache(..., { revalidate: RELEASES_FEED_CACHE_SECONDS (3600), tags: ["releases"] })` — `src/lib/releases.ts:165-166,605-611`.
- **Live bypass:** `getRecentReleasesPageLive` без cache — `releases.ts:616-617`.
- **Search:** `unstable_cache` вокруг quick/advanced/description в `src/lib/search.ts` (export wrappers ~1098+).
- **Cover:** disk/cache + stale browser `STALE_BROWSER_CACHE_SEC = 60` — `src/app/api/cover/route.ts:24+`.
- **Brand logos / watch-party settings:** in-memory TTL ~30s — `src/lib/brand-rotation.ts`, `src/lib/admin/watch-party-settings.ts`.
- **Shikimori anime:** DB snapshot + SWR-стиль refresh (см. `anime-page` / relation snapshots).

## 1.7
Нотификации:
- **Каналы:** `browser | fcm | telegram | vk | discord` — `src/lib/notifications/types.ts:4`.
- **Worker:** `scripts/notification-worker.ts` + `src/lib/notifications/worker.ts`.
- **Senders:** `src/lib/notifications/channels/{browser,fcm,telegram,vk,discord}.ts`.
- **In-app feed:** `src/lib/notifications/in-app-feed.ts` (если присутствует).
- User prefs / links / deliveries — Prisma models `Notification*`, admin settings API.

## 1.8
**Brand rotation** — детерминированная ротация WEBP-логотипов из `public/brand-logos` по time-slot + seed.
Файлы:
- `src/lib/brand-rotation.ts`
- `src/lib/admin/brand-rotation-settings.ts`
- `src/app/api/brand/logo|icon|favicon/route.ts`
- admin UI panel brand-rotation
- sync script `scripts/sync-brand-assets.mjs`

## 1.9
Cover/poster proxy:
1. UI: `coverCacheUrl(shikimoriId)` → `/api/cover?id=…` — `src/lib/poster.ts:13-33`.
2. Handler: `GET` `src/app/api/cover/route.ts`.
3. Цепочка (упрощённо): fresh disk cache → stale + background refill → resolve source URL (order: url/kodik/material_db/cvh/shikimori/worldart из settings) → fetch+sharp cache → direct fallback → **404 Image not found** (`route.ts:72` и др.).
4. Helpers: `src/lib/cover-cache.ts` (`resolveCoverSourceUrl`, `resolveCoverSourceUrlQuick`), `poster-fallback.ts`, `material-poster.ts`, `world-art-poster.ts`.

Гарантированного static placeholder в `poster.ts` **нет** (см. 5.3).

## 1.10
Watch party:
- **Client:** `src/hooks/useWatchParty.ts` — WS, invite (`watchRoom`), guest names, permissions; интеграция в `AnimeWatchPanel`.
- **Settings API:** `/api/settings/watch-party`, admin rooms API.
- **Server:** `scripts/watch-party-server.mjs` (отдельный process, `npm run watch-party:server`).
- **Модель:** in-memory rooms; первый join → master (`masterParticipantId`); leave master → next `clients.keys().next()` — server ~231, ~262-281.
- **Протокол (сообщения):** join/leave/presence/play/pause/seek/episode/translation/state-sync/request-sync/set-permissions (см. switch в server).
- Heartbeat / periodic state-sync — константы в начале `watch-party-server.mjs`.
