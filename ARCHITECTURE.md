# Track Anime — Architecture

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  Presentation (src/app, src/components)                 │
│  Server Components (pages) + Client Components (UI)   │
├─────────────────────────────────────────────────────────┤
│  API Layer (src/app/api/*)                              │
│  Route handlers, auth guards, JSON responses            │
├─────────────────────────────────────────────────────────┤
│  Domain / Services (src/lib/*, src/kodik/*)             │
│  Business logic, external API clients, caching          │
├─────────────────────────────────────────────────────────┤
│  Data Access (src/lib/prisma.ts, src/db/*)              │
│  Prisma ORM, raw SQL where needed                       │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL (prisma/schema.prisma)                      │
└─────────────────────────────────────────────────────────┘
```

## App Flow

### Request lifecycle (typical page)

1. `src/app/**/page.tsx` (Server Component) вызывает `getSession()` и lib-функции
2. Lib загружает данные из PostgreSQL и/или внешних API (Shikimori, Kodik)
3. DTO сериализуется и передаётся в client components как props
4. Client components делают `fetch("/api/...")` для мутаций (списки, прогресс, настройки)

### Auth flow

```
GET /api/auth/shikimori
  → save OAuth state (cookie + OAuthState table)
  → redirect to Shikimori authorize

GET /api/auth/callback/shikimori?code=&state=
  → validate state
  → exchange code for tokens
  → GET /api/users/whoami
  → upsert User + ShikimoriAccount
  → create Session, set ta.session cookie
```

Нет `middleware.ts` — auth проверяется per-route через `getSession()` / `requireAdmin()`.

### Kodik data pipeline

```
Kodik API (/list, /search)
  → src/kodik/client.ts (rate-limited HTTP)
  → src/db/save-material.ts (upsert KodikMaterial, seasons, episodes, releases)
  → PostgreSQL

Import: scripts/kodik-import-full.ts
  Phase 1 (catalog): paginate list, save materials without episodes
  Phase 2 (episodes): fetch with_episodes_data, save episodes

Sync: src/lib/admin/kodik-sync.ts
  Fetch N recent pages → update materials → detect new episode releases
  → KodikEpisodeRelease for home feed
```

### Player flow

```
getAnimePageData(shikimoriId)
  → Kodik translations from DB
  → Shikimori metadata (cached)

AnimeWatchPanel (client)
  → KodikPlayer iframe (playerLink)
  → postMessage: kodik_player_time_update, kodik_player_current_episode
  → PUT /api/user/watch-history/[shikimoriId]
```

## Integrations

| Service | Client module | Auth | Rate limit |
|---------|---------------|------|------------|
| Shikimori public API | `src/lib/shikimori/client.ts` | None | `rate-limiter.ts` |
| Shikimori user API | `src/lib/shikimori/auth-client.ts` | OAuth tokens per user | Shared limiter |
| Shikimori OAuth | `src/lib/auth/shikimori-oauth.ts` | Client ID/secret | — |
| Kodik API | `src/kodik/client.ts` | API token | `src/kodik/rate-limiter.ts` |
| Kodik player | iframe + `src/lib/kodik-player-api.ts` | — | — |

Shikimori host (`shikimori.io` / `shikimori.one`) настраивается в `ShikimoriSettings` (админка).

## Important Services

### Session (`src/lib/auth/session.ts`)

- Cookie `ta.session` → `Session` row в БД
- TTL 30 дней
- `getSession()` — основная точка проверки auth

### Prisma (`src/lib/prisma.ts`)

- Singleton с dev global reuse
- Schema: `prisma/schema.prisma`

### Cover cache (`src/lib/cover-cache.ts`)

- `GET /api/cover` — прокси и кэш обложек (sharp resize)
- Настройки в `CoverCacheSettings`

### Shikimori anime cache (`src/lib/shikimori/anime-cache.ts`)

- JSON-кэш метаданных аниме в БД
- TTL + background refresh

### Favorites sync (`src/lib/favorites-sync.ts`)

- Pull user_rates и favourites с Shikimori → `UserAnimeListEntry`, `UserAnimeBookmark`
- Метаданные в `UserListSync`

### Releases feed (`src/lib/releases.ts`)

- Cursor pagination по `KodikEpisodeRelease`
- Фильтр по translation (site settings)

## Admin Subsystem

`src/app/admin/*` + `src/app/api/admin/*` + `src/lib/admin/*`

- Kodik import/sync management
- Auto-sync scheduler (`kodik-sync-scheduler.ts`)
- DB explorer, user management, todos
- Cover cache and Shikimori host settings

## Caching Strategy

| Data | Strategy |
|------|----------|
| Anime page | `revalidate = 3600` |
| Home feed | `revalidate = 300` |
| Shikimori anime | DB cache + `unstable_cache` |
| Posters | Disk cache via `/api/cover` |
| Search | No cache (live DB query) |
