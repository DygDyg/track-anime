# Раздел 1 — Архитектура

## 1.1. Стек проекта

| Слой | Технология | Конфиг / файлы |
|------|------------|----------------|
| Framework | Next.js 16 (App Router) | `package.json` (`"next": "^16.2.9"`), `next.config.ts` |
| UI | React 19, Tailwind CSS 3 | `package.json`, `src/app/globals.css` |
| Language | TypeScript 5 | `tsconfig.json` |
| Database | PostgreSQL 16 (Docker) | `docker-compose.yml`, `DATABASE_URL` в `.env.example` |
| ORM | Prisma 6 | `prisma/schema.prisma`, `src/lib/prisma.ts` |
| Auth | Shikimori OAuth2 (custom, без NextAuth) | `src/lib/auth/shikimori-oauth.ts`, `src/lib/auth/session.ts`, `src/lib/auth/config.ts` |
| External APIs | Kodik, Shikimori, AniSkip | `src/kodik/client.ts`, `src/lib/shikimori/client.ts`, `src/lib/aniskip.ts` |
| Video | Kodik iframe + postMessage | `src/components/anime/KodikPlayer.tsx`, `src/lib/kodik-player-api.ts` |
| Images | sharp (cover cache) | `src/lib/cover-cache.ts` |

Источники: `PROJECT_OVERVIEW.md` (Tech Stack), `ARCHITECTURE.md`.

## 1.2. Схема данных (текстом)

```
Shikimori anime.id  ══════════════════════════════╗
                                                   ║  доменный ключ
KodikMaterial.shikimoriId (Int?, indexed)  <═══════╣
                                                   ║
URL /anime/[shikimoriId]  <════════════════════════╝

KodikMaterial
  PK: kodikId (String)
  translationId, translationTitle, playerLink
  1..N KodikSeason → KodikEpisode
  1..N KodikEpisodeRelease
  N..N KodikMaterialGenre

UserWatchProgress
  @@unique([userId, shikimoriId])  ← НЕ per translation
  kodikId (текущая озвучка), seasonNumber, episodeNumber, positionSeconds

AnimeExternalIdMap
  PK: shikimoriId
  malId Int?  — кэш для AniSkip / CVH / обложек
  НЕ заменяет доменный ключ сайта
```

Ключевые поля: `prisma/schema.prisma` — `KodikMaterial` ~306–340, `UserWatchProgress` ~642–658, `AnimeExternalIdMap` ~81–89.

## 1.3. Цепочка Kodik API → БД

```
Kodik API (/list, /search)
  → src/kodik/client.ts (kodikListByUrl / kodikSearch, rate-limited)
  → src/db/save-material.ts::saveKodikMaterial (upsert KodikMaterial, seasons, episodes, releases)
  → PostgreSQL
```

| Режим | Entry | Логика |
|-------|-------|--------|
| Full import | `scripts/kodik-import-full.ts` | Phase catalog → episodes; state в `KodikImportJob` |
| Incremental sync | `src/lib/admin/kodik-sync.ts` + `scripts/kodik-sync-recent.ts` | N recent pages, `trackReleases: true` |
| Scheduled | `scripts/kodik-sync-scheduled.ts` | cron |
| On-demand | `src/lib/kodik-ensure-materials.ts::ensureKodikMaterialsForShikimoriId` | `/search?shikimori_id=` при пустой странице аниме |

## 1.4. Сервер vs клиент

**Правило:** браузер не вызывает Shikimori/Kodik напрямую; только server/`/api/*` (`AGENTS.md`, `AI_CONTEXT.md`).

| Сторона | Примеры |
|---------|---------|
| Server | `src/lib/anime-page.ts`, `src/lib/releases.ts`, `src/lib/search.ts` (`import "server-only"`), `src/kodik/client.ts`, `src/app/api/**/route.ts` |
| Client | `src/components/ReleaseFeed.tsx`, `src/components/anime/AnimeWatchPanel.tsx`, `src/components/anime/KodikPlayer.tsx`, `src/hooks/useWatchParty.ts` |

## 1.5. App Router — dynamic segments

| Segment | Назначение |
|---------|------------|
| `anime/[shikimoriId]` | Страница тайтла + плеер |
| `user/[shikimoriId]` (+ `favorites/`) | Публичный профиль и списки |
| `api/anime/[shikimoriId]` | Episodes, skip-times, CVH и др. |
| `api/admin/anime/[shikimoriId]` | Админ-отладка тайтла |
| `api/admin/todos/[id]` | Admin todos CRUD |
| `api/characters/[characterId]` | Персонажи |
| `api/user/anime-lists/[shikimoriId]` | Мутации списков |
| `api/user/friends/[shikimoriId]` | Друзья |
| `api/user/friends/incoming/[shikimoriId]` | Входящие заявки |
| `api/user/watch-history/[shikimoriId]` | Прогресс просмотра |
| `api/bg/[file]` | Фоновые изображения |
| `serwist/[path]` | PWA/service worker |

Источник: обход `src/app/**/[param]` + `CODEBASE_MAP.md`.

## 1.6. Кэширование

| Данные | Стратегия | Где |
|--------|-----------|-----|
| Home feed | `unstable_cache`, revalidate 1h, tag `releases` | `src/lib/releases.ts` ~605–612; `revalidateTag("releases")` в admin sync |
| Anime page | `revalidate = 3600` + React `cache()` | page + `getAnimePageData` |
| Calendar | `unstable_cache`, 300s, tag `calendar` | `src/lib/calendar.ts` |
| Shikimori anime | DB cache + `unstable_cache` | `src/lib/shikimori/anime-cache.ts` |
| Posters | Disk cache via `/api/cover` | `src/lib/cover-cache.ts` |
| Search | Live DB; public search через `unstable_cache` + slot gate | `src/lib/search.ts` ~1091 |
| Translation catalog / comments / characters | `unstable_cache` | соответствующие lib-модули |

Таблица: `ARCHITECTURE.md` § Caching Strategy.

## 1.7. Нотификации

**Каналы:** browser push, FCM (Android), Discord, Telegram, VK, in-app лента.

**Ключевые файлы:**
- `src/lib/notifications/` (dispatcher, channels: `browser.ts`, `discord.ts`, `telegram.ts`, `vk.ts`, `fcm.ts`)
- `src/app/api/notifications/`, `src/app/api/user/notification-preferences`
- `scripts/notification-worker.ts`
- Prisma: `UserNotificationPreferences`, `UserNotificationLink`, `NotificationDelivery`, `PushSubscription`, `FcmDeviceToken`

## 1.8. Brand rotation

Детерминированная ротация `.webp` из `public/brand-logos` по временному слоту из `BrandRotationSettings`.

Файлы:
- `src/lib/brand-rotation.ts` — `getActiveBrandAsset`, `listBrandLogoFiles`, `pickLogoForSlot`
- `src/components/admin/BrandRotationSettingsPanel.tsx`
- API: `/api/brand/logo`, `/api/brand/icon`, `/api/brand/favicon`
- Fallback: `public/logo.webp`

## 1.9. Cover/poster proxy

```
Клиент: coverCacheUrl / resolvePosterUrl (poster.ts)
  → GET /api/cover?id={shikimoriId}[&url=][&size=thumb|full][&force=true]
  → disk cache (cover-cache.ts, sharp)
  → при miss: discoverPosterCandidates (poster-fallback.ts)
```

Порядок источников (админ `CoverCacheSettings.sourceOrder`, дефолт):  
`url` → `kodik` → `material_db` / `release_db` → `cvh` → `shikimori` / `shikimori_video` → `worldart`.

При полном провале: `404 Image not found` (`src/app/api/cover/route.ts` ~72); клиентский `resolvePosterDisplayUrl` может вернуть `null` (`poster.ts` ~136) — отдельного дефолтного placeholder-изображения в `poster.ts` нет.

## 1.10. Watch party

| Слой | Файл | Роль |
|------|------|------|
| Клиент | `src/hooks/useWatchParty.ts` | WebSocket, presence, команды |
| UI | `AnimeWatchPanel.tsx` | создание/вход, sync play/seek/episode |
| Протокол | `src/lib/watch-party/types.ts` | versioned client/server messages |
| Сервер | `scripts/watch-party-server.mjs` | in-memory rooms, state-sync каждые 2s |
| Настройки | `WatchPartySettings` + `/api/settings/watch-party` | enabled, allowGuests |
| Роли | master управляет; при leave мастера — handoff следующему (`watch-party-server.mjs` ~262–289) |

Комнаты ephemeral (не в БД живьём); история сессий — `WatchPartySession*`.
