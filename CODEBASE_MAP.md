# Track Anime — Codebase Map

## Root Structure

```
ta_new/
├── prisma/schema.prisma     # DB schema
├── src/
│   ├── app/                 # Next.js App Router (pages + API)
│   ├── components/          # React components
│   ├── lib/                 # Server/domain logic
│   ├── kodik/               # Kodik API client
│   ├── db/                  # DB persistence helpers
│   ├── hooks/               # React hooks
│   ├── types/               # Shared TypeScript types
│   └── assets/              # Fonts, static assets
├── scripts/                 # CLI: import, sync, deploy, debug
├── docs/                    # API references, server docs
├── public/                  # Static files (favicons, bg images)
├── bg/                      # Background images (alternative location)
└── data/                    # Local data files
```

## `src/app/` — Pages and Routes

| Path | Purpose |
|------|---------|
| `page.tsx` | Home — release feed + history new episodes |
| `anime/[shikimoriId]/` | Anime page with player |
| `search/` | Search results |
| `favorites/` | User anime lists and bookmarks |
| `history/` | Watch history |
| `calendar/` | Ongoing anime schedule |
| `profile/` | Current user profile |
| `user/[shikimoriId]/` | Public user profile |
| `login/` | Shikimori OAuth login |
| `auth/complete/` | Post-OAuth redirect helper |
| `players/` | Player-related pages |
| `admin/` | Admin dashboard (import, sync, users, db, todos) |

## `src/app/api/` — API Routes

### Auth (`api/auth/`)

| Route | Methods | Module |
|-------|---------|--------|
| `shikimori` | GET | Start OAuth |
| `callback/shikimori` | GET | OAuth callback |
| `session` | GET | Current user |
| `logout` | POST | End session |
| `config` | GET | Login page config |

### User (`api/user/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `anime-lists` | GET | All list entries |
| `anime-lists/[shikimoriId]` | PUT | Update list status |
| `watch-history` | GET | Full history |
| `watch-history/[shikimoriId]` | GET/PUT/DELETE | Per-anime progress |
| `site-settings` | GET/PUT | UI preferences |

### Content

| Route | Purpose |
|-------|---------|
| `releases` | Paginated home feed |
| `search` | Anime search |
| `cover` | Poster proxy/cache |
| `anime/[shikimoriId]/trailer` | YouTube trailer |
| `bg/[file]` | Background images |
| `favorites`, `favorites/sync` | Favorites data + Shikimori sync |
| `settings/translations` | Translation catalog |

### Admin (`api/admin/`)

`stats`, `import/status`, `import/episodes`, `sync`, `sync/settings`, `sync/history`, `backfill-dates`, `cover-cache/settings`, `shikimori/settings`, `users`, `db/search`, `todos`, `todos/[id]`

## `src/lib/` — Core Modules

### Auth (`lib/auth/`)

| File | Responsibility |
|------|----------------|
| `session.ts` | Cookie session CRUD, `getSession()` |
| `shikimori-oauth.ts` | Token exchange, refresh, whoami |
| `config.ts` | OAuth env, redirect URI, admin bootstrap |
| `oauth-state-store.ts` | CSRF state in DB |
| `admin.ts` | `requireAdmin()` guards |
| `request-origin.ts` | Public origin from headers |

### Shikimori (`lib/shikimori/`)

| File | Responsibility |
|------|----------------|
| `client.ts` | Public API fetch + rate limit |
| `auth-client.ts` | Authenticated fetch + token refresh |
| `animes.ts` / `anime-cache.ts` | Anime metadata with cache |
| `user-rates.ts` | User list entries |
| `favorites.ts` | User bookmarks |
| `user-list-mutations.ts` | Add/remove from lists |
| `endpoints.ts` | Configurable Shikimori host |
| `rate-limiter.ts` | Global throttle |
| `users.ts`, `friends.ts`, `related.ts`, `trailer.ts` | Profile/social features |

### Admin (`lib/admin/`)

| File | Responsibility |
|------|----------------|
| `kodik-import.ts` | Episodes import runner |
| `kodik-sync.ts` | Incremental sync |
| `kodik-sync-scheduler.ts` | Cron auto-sync |
| `kodik-sync-settings.ts` | Sync config + history |
| `import-job.ts` | Import job state tracking |
| `cover-cache-settings.ts` | Cover cache admin |
| `db-explorer.ts` | Admin DB search |
| `stats.ts`, `storage-stats.ts` | Dashboard metrics |
| `todos.ts` | Dev todo list |

### Domain (root `lib/`)

| File | Responsibility |
|------|----------------|
| `anime-page.ts` | Anime page data loader |
| `releases.ts` | Home feed queries |
| `search.ts` | DB search (server-only) |
| `favorites-page.ts` | Favorites page data |
| `favorites-sync.ts` | Shikimori list sync |
| `watch-history.ts` | Watch progress CRUD |
| `history-new-episodes.ts` | Home history block |
| `calendar.ts` | Release calendar |
| `cover-cache.ts` | Poster caching |
| `poster.ts`, `poster-fallback.ts` | Poster resolution chain |
| `kodik-player-api.ts` | Kodik iframe postMessage |
| `prisma.ts` | DB client singleton |
| `site-settings.ts` | User UI settings |
| `theme.ts` | Dark/light theme |

## `src/kodik/` — Kodik API

| File | Responsibility |
|------|----------------|
| `client.ts` | `kodikSearch`, `kodikListByUrl`, `buildListUrl` |
| `types.ts` | Kodik API types |
| `rate-limiter.ts` | Request throttle |

## `src/db/` — Persistence

| File | Responsibility |
|------|----------------|
| `save-material.ts` | Upsert KodikMaterial, seasons, episodes, releases |
| `save-shikimori-material.ts` | Shikimori material stubs |

## `src/components/` — UI

| Folder | Key components |
|--------|----------------|
| `anime/` | `AnimePageView`, `AnimeWatchPanel`, `KodikPlayer`, `AnimeListActions` |
| `auth/` | `AuthProvider` |
| `header/` | `Header`, `HeaderSearch` |
| `favorites/` | `FavoritesView`, `UserListStatusProvider` |
| `history/` | `HistoryView` |
| `search/` | `SearchResultsView`, `SearchResultCard` |
| `calendar/` | `CalendarView` |
| `profile/` | `ProfileCard`, `ProfileFriendsSection` |
| `settings/` | `SiteSettingsModal`, providers |
| `admin/` | Import/sync panels, DB explorer, stats |

Root components: `ReleaseFeed`, `ReleaseCard`, `Header`, `SiteBackground`, `ThemeProvider`, `NavigationProgress`.

## `scripts/` — CLI Tools

| Script | npm command | Purpose |
|--------|-------------|---------|
| `kodik-import-full.ts` | `kodik:import` | Full catalog + episodes import |
| `kodik-sync-recent.ts` | `kodik:sync` | Manual incremental sync |
| `kodik-sync-scheduled.ts` | `kodik:sync:scheduled` | Cron scheduler |
| `kodik-backfill-release-dates.ts` | `kodik:backfill-dates` | Backfill dates |
| `sync-brand-assets.mjs` | `brand:sync` | Logo hash generation |
| `write-build-info.mjs` | (build hook) | Build number |
| `deploy.ps1`, `server-deploy.sh` | — | Deployment |

## `prisma/schema.prisma` — Key Models

| Model | Purpose |
|-------|---------|
| `KodikMaterial` | One anime + one translation (Kodik unit) |
| `KodikEpisode` | Episode with player link |
| `KodikEpisodeRelease` | Home feed entries |
| `User`, `Session`, `ShikimoriAccount` | Auth |
| `UserAnimeListEntry`, `UserAnimeBookmark` | Shikimori list cache |
| `UserWatchProgress` | Watch position |
| `KodikImportJob`, `KodikSyncRun`, `KodikSyncSettings` | Import/sync state |
