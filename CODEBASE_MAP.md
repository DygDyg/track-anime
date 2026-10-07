# Track Anime — Codebase Map

## Root Structure

```
ta_new/
├── android/               # Native WebView shell: Android phone + Android TV launchers, shortcuts, proxy/cache settings, update checker
├── windows/               # Native WPF + WebView2 shell for Windows (mirrors, proxy, adblock, settings, update checker)
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
| `not-found.tsx` | Custom 404 page with animated Track Anime error scene |
| `anime/[shikimoriId]/` | Anime page with player |
| `search/` | Search results |
| `favorites/` | Legacy redirect → `/user/{ownId}/favorites` |
| `history/` | Watch history |
| `calendar/` | Ongoing anime schedule with Kodik/Shikimori source switch |
| `profile/` | Current user profile |
| `user/[shikimoriId]/` | Public user profile + `favorites/` lists UI |
| `login/` | Shikimori OAuth, локальный пароль и QR login |
| `players/` | Player-related pages |
| `admin/` | Admin dashboard (import, sync, users, db, todos, notifications, settings) |

## `src/app/api/` — API Routes

### Auth (`api/auth/`)

| Route | Methods | Module |
|-------|---------|--------|
| `shikimori` | GET | Start OAuth |
| `shikimori/reconnect` | GET | Reconnect current account |
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
| `recent-anime-opens` | GET/POST/PUT | Recently opened anime |
| `notification-preferences` | GET/PUT | User notification settings |
| `notification-preferences/test` | POST | User test notification |
| `friends/[shikimoriId]` | GET/POST/DELETE | Friend status and mutations |
| `friends/incoming/[shikimoriId]` | DELETE | Reject incoming friend request |

### Content

| Route | Purpose |
|-------|---------|
| `releases` | Paginated home feed |
| `search` | Anime search |
| `search/suggest` | Header search suggestions |
| `search/settings` | Public search UI settings |
| `cover` | Poster proxy/cache |
| `brand/logo`, `brand/icon`, `brand/favicon` | Текущий бренд-логотип и производные иконки |
| `image-cache` | Studio logo and screenshot proxy/cache |
| `characters/[characterId]/hover-preview` | Character hover preview |
| `anime/[shikimoriId]/comments` | Shikimori comments proxy |
| `anime/[shikimoriId]/episodes` | Episode metadata |
| `anime/[shikimoriId]/hover-preview` | Anime hover preview |
| `anime/[shikimoriId]/trailer` | YouTube trailer |
| `anime/[shikimoriId]/skip-times` | Server-side AniSkip OP/ED timings |
| `bg/[file]` | Background images |
| `favorites`, `favorites/sync` | Favorites data + Shikimori sync |
| `discord/config` | Public Discord RPC config |
| `settings/backgrounds` | Background catalog |
| `settings/defaults` | Public site setting defaults |
| `settings/intro-offsets` | Public translation intro offsets |
| `settings/translations` | Translation catalog |
| `settings/watch-party` | Public global settings for TA-плеер совместный просмотр |
| `settings/app-promo` | Public kill-switch for soft-promo приложений |
| `site-build` | Current build timestamp for notifying an open client about an update |
| `app/og.png` | PNG Open Graph card for the Android app download page |

### Realtime

| Process | Purpose |
|---------|---------|
| `scripts/watch-party-server.mjs` | WebSocket server for ephemeral TA-плеер совместный просмотр rooms (`/watch-party-ws` by default), plus read-only `/watch-party-rooms` for admin room overview; persists session history via `scripts/watch-party-history.mjs` |

### Notifications (`api/notifications/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `push-subscribe` | POST/DELETE | Browser push subscription |
| `vapid-public-key` | GET | Public VAPID key |
| `in-app` | GET | In-app notification feed |
| `discord/link` | GET | Start Discord link |
| `discord/callback` | GET | Discord OAuth callback |
| `discord/verify` | POST | Verify Discord link |
| `discord/unlink` | DELETE | Remove Discord link |
| `telegram/link` | POST/DELETE | Telegram link lifecycle |
| `vk/link` | POST/DELETE | VK link lifecycle |

### Admin (`api/admin/`)

`stats`, `audience`, `audience/markdown`, `anime/[shikimoriId]/skip-times-prefetch`, `anime-debug`, `import/status`, `import/episodes`, `import/pending-materials`, `sync`, `sync/settings`, `sync/history`, `backfill-dates`, `brand-rotation/settings`, `cover-cache/settings`, `cover-cache/refresh-recent`, `discord/settings`, `notifications/settings`, `notifications/test`, `notifications/generate-vapid`, `search/settings`, `shikimori/settings`, `shikimori/anons-sync`, `shikimori/mal-id-sync`, `site-settings-defaults`, `translation-intro-offsets`, `watch-history/settings`, `watch-party/settings`, `watch-party/rooms`, `watch-party/history`, `users`, `db/search`, `db-backup/settings`, `db-backup/run`, `db-backup/test`, `todos`, `todos/[id]`

Public analytics: `api/analytics/beacon` (POST) — visitor cookie + page aggregates; `api/analytics/play` (POST) — anime playback starts; `api/analytics/watch-share` (POST) — deep-link copy log

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
| `relation-snapshot.ts` | Durable related/franchise/similar snapshots (`AnimeRelationSnapshot`) |
| `related.ts` / `franchise.ts` / `similar.ts` | Shikimori relation APIs + mappers |
| `mal-id.ts` | Server-side Shikimori ID → MAL ID mapping for AniSkip-style integrations |
| `user-rates.ts` | User list entries |
| `favorites.ts` | User bookmarks |
| `user-list-mutations.ts` | Add/remove from lists, set score (1–10) |
| `endpoints.ts` | Configurable Shikimori host |
| `rate-limiter.ts` | Global throttle |
| `users.ts`, `friends.ts`, `trailer.ts` | Profile/social features |

### Admin (`lib/admin/`)

| File | Responsibility |
|------|----------------|
| `kodik-import.ts` | Episodes import runner |
| `mal-id-sync.ts` | MAL ID coverage, refresh, and background sync helper |
| `pending-kodik-materials.ts` | Pending episodes admin list |
| `kodik-sync.ts` | Incremental sync |
| `kodik-sync-scheduler.ts` | Cron auto-sync |
| `kodik-sync-settings.ts` | Sync config + history |
| `kodik-db-freshness.ts` | Last successful sync age for admin home banner |
| `import-job.ts` | Import job state tracking |
| `cover-cache-settings.ts` | Cover cache admin (TTL, quality, sourceOrder) |
| `cover-cache-refresh-recent.ts` | Recent-release shikimoriId list for admin cover refresh |
| `cover-cache-refresh-client.ts` | Browser sequential cover refresh (cache URL then force URL) |
| `notification-settings.ts` | Notification defaults, linkBaseUrl for social/FCM links, admin test helpers |
| `link-base-url.ts` | Notification link origin helpers (`AUTH_URL` fallback + github.io flag) |
| `site-settings-defaults.ts` | Global site setting defaults |
| `translation-intro-offsets.ts` | Translation intro offset admin |
| `fuzzy-text-match.ts` | Client-safe fuzzy + QWERTY↔ЙЦУКЕН match for translation search |
| `keyboard-layout.ts` | QWERTY↔ЙЦУКЕН layout switch for search queries |
| `watch-history-settings.ts` | Watch history admin settings |
| `watch-party-settings.ts` | TA-плеер совместный просмотр global admin settings |
| `app-promo-settings.ts` | Soft-promo apps: mobile + desktop kill-switches |
| `watch-party-rooms.ts` | Read-only active room overview for admin page, enriched with Kodik title/translation metadata |
| `watch-party-history.ts` | Persisted watch-party session history for admin |
| `db-explorer.ts` | Admin DB search |
| `db-backup.ts`, `db-backup-settings.ts`, `db-backup-webdav.ts`, `db-backup-scheduler.ts` | WebDAV DB backup (tables, chunks, cron) |
| `db-backup-format.ts`, `db-backup-settings-types.ts` | Client-safe backup types / formatBytes |
| `stats.ts`, `storage-stats.ts`, `server-load.ts`, `server-load-types.ts`, `host-reboot.ts`, `host-reboot-types.ts` | Dashboard metrics, host load, guarded host reboot for `/admin` |
| `audience-stats.ts` | DAU/WAU/MAU, platforms, player Kodik/TA vs VideoHUB, section/title popularity |
| `audience-stats-markdown.ts` | Markdown snapshot for `/admin/audience` export |
| `watch-share-log.ts` | Admin DTO for anime watch deep-link copy log |
| `notification-subscription-stats.ts` | Counts of notification subscribers by type/channel |
| `todos.ts` | Dev todo list |

### Analytics (`lib/analytics/`)

| File | Responsibility |
|------|----------------|
| `config.ts` | `ta.vid` cookie options, throttle/retention |
| `ua.ts` | UA/path parse, identity key, clientKind |
| `track.ts` | Upsert visitor + day/content aggregates |

### Domain (root `lib/`)

| File | Responsibility |
|------|----------------|
| `anime-page.ts` | Anime page data loader |
| `cvh-player.ts` | CDN VideoHub pub/aggr (в т.ч. `shikimori`→MAL fallback), playlist helpers, URL для запасного `/cdn-iframe` |
| `kodik-ensure-materials.ts` | On-demand Kodik materials by shikimoriId when page has none |
| `releases.ts` | Home feed queries |
| `search.ts` | DB search (server-only) |
| `search-settings.ts` | Search UI settings |
| `favorites-page.ts` | Favorites page data |
| `favorites-sync.ts` | Shikimori list sync |
| `watch-history.ts` | Watch progress CRUD |
| `anime-watch-share.ts` | Deep-link GET params + share URL (player/season/episode/translation/t/nosave) |
| `anime-related.ts` | Related/similar sections: snapshot SWR + enrich briefs |
| `history-new-episodes.ts` | Home history block |
| `history-upcoming-soon.ts` | History page «Скоро выйдут» block (last ep in dub + 7d, 12h window) |
| `calendar.ts` | Release calendar, Shikimori/Kodik ongoing sources and anons grouping |
| `cover-cache.ts` | Poster caching + freshness jitter |
| `image-cache.ts`, `image-cache-url.ts` | Studio logo/screenshot server cache + URL helper |
| `poster.ts`, `poster-fallback.ts` | Poster resolution by configurable source order |
| `kodik-player-api.ts` | Kodik iframe postMessage |
| `watch-party/types.ts` | Shared WebSocket room message and state types |
| `aniskip.ts` | AniSkip client + `AnimeEpisodeSkipTime` cache |
| `notifications/*` | Notification preferences, links, payloads, channels, worker helpers |
| `prisma.ts` | DB client singleton |
| `site-settings.ts` | User UI settings |
| `pattern-backgrounds.ts` | CSS pattern wallpaper catalog (`pattern:*`; only site backgrounds) |
| `background-images.ts` | Legacy `public/bg` listing (admin storage stats / `/api/bg`) |
| `theme.ts` | Dark/light theme |

## `src/kodik/` — Kodik API

| File | Responsibility |
|------|----------------|
| `client.ts` | `kodikSearch`, `kodikListByUrl`, `buildListUrl` |
| `anime-types.ts` | `KODIK_ANIME_LIST_TYPES` (`anime,anime-serial`) for import/sync |
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
| `anime/` | `AnimePageView`, `AnimeWatchPanel`, `KodikPlayer`, `CvhWatchSection` / `CvhPlayerFrame`, `AnimeListActions`, `AnimeShikimoriRating` + `AnimeUserScoreVote` |
| `admin/` | `AdminAnimeDebugButton` — защищённое окно данных тайтла/серии; `AdminForceCoverButton` — force-перекачка обложки на странице тайтла |
| `auth/` | `AuthProvider` |
| `header/` | `Header`, `HeaderSearch` |
| `favorites/` | `FavoritesView`, `UserListStatusProvider` |
| `history/` | `HistoryView`, `HistoryWatchCard`, `HistoryUpcomingSoonPanel` |
| `search/` | `SearchResultsView`, `SearchResultCard` |
| `calendar/` | `CalendarView` |
| `profile/` | `ProfileCard`, `ProfileFriendsSection` |
| `notifications/` | Notification discovery CTA |
| `settings/` | `SiteSettingsModal`, providers |
| `companion/` | `AquaCoderCompanion` — corner mascot + admin animation debug |
| `user/` | `UsersSearchForm` |
| `admin/` | Import/sync panels, MAL ID sync, notifications, DB explorer, stats |

Root components: `ReleaseFeed`, `ReleaseCard`, `Header`, `RecentAnimeOpensButton`, `SiteBackground` → `PatternSiteBackground` (`pattern:*` only), `ThemeProvider`, `NavigationProgress`, `PullToRefresh`, `AquaCoderCompanion`, `ClientUpdateGuard` (checks new build in an open tab).

Brand assets: `public/brand-logos/` contains optional `.webp` logos for global rotation; fallback remains `public/logo.webp`.
Companion assets: `public/companion/aqua-coder-chibi/` (manifest + per-animation WebP atlases); renderer `src/lib/companion/AquaCoderCanvas.ts`; reactions bus `src/lib/companion/companion-bus.ts`; source package `aqua-coder-web/`.
Error page asset: `public/404.webm` is used by the custom App Router 404 page.

## `scripts/` — CLI Tools

| Script | npm command | Purpose |
|--------|-------------|---------|
| `kodik-import-full.ts` | `kodik:import` | Full catalog + episodes import |
| `kodik-sync-recent.ts` | `kodik:sync` | Manual incremental sync |
| `kodik-sync-scheduled.ts` | `kodik:sync:scheduled` | Cron scheduler (sync + anons + notifications + WebDAV DB backup) |
| `db-backup-webdav.ts` | `db:backup:webdav` | Manual WebDAV DB backup (admin settings) |
| `kodik-backfill-release-dates.ts` | `kodik:backfill-dates` | Backfill dates |
| `shikimori-malid-stats.ts` | `shikimori:malid-stats` | MAL ID mapping coverage and optional refresh |
| `sync-brand-assets.mjs` | `brand:sync` | Logo hash generation |
| `write-build-info.mjs` | (build hook) | Build number |
| `backup-db.ps1` | `db:backup` | Local Docker PostgreSQL dump |
| `pull-prod-db.ps1` | `db:pull-prod`, `db:restore-prod` | Download production DB dump and optionally restore local dev DB |
| `start-dev.bat` | — | Windows one-click dev startup: Docker/PostgreSQL, Prisma schema, watch-party WebSocket and Next.js |
| `deploy-auto.ps1`, `deploy.ps1`, `deploy-rpc.ps1`, `deploy-apk.ps1`, `deploy-config.ps1`, `server-deploy.sh` | — | Deployment (auto / site / rpc / apk + local proxy) |
| `notification-worker.ts` | `notifications:worker` | Background notification delivery |
| `watch-party-server.mjs` | `watch-party:server` | WebSocket rooms for TA-плеер совместный просмотр |
| `watch-party-history.mjs` | (used by watch-party server) | Persist session history to Postgres |
| `telegram-notification-bot.ts` | `notifications:telegram-bot` | Telegram notification link bot |
| `vk-notification-bot.ts` | `notifications:vk-bot` | VK notification link bot |
| `generate-vapid-keys.ts` | `notifications:generate-vapid` | VAPID key generation |

## `prisma/schema.prisma` — Key Models

| Model | Purpose |
|-------|---------|
| `KodikMaterial` | One anime + one translation (Kodik unit) |
| `SearchSettings` | Header search debounce settings |
| `AnimeExternalIdMap` | External anime ID cache (`shikimoriId -> malId`) |
| `AnimeRelationSnapshot` | Cached Shikimori related/franchise/similar payloads (SWR) |
| `AnimeEpisodeSkipTime` | Cached AniSkip OP/ED/recap intervals |
| `KodikEpisode` | Episode with player link |
| `KodikEpisodeRelease` | Home feed entries |
| `User`, `Session`, `ShikimoriAccount`, `LocalCredential`, `QrLoginRequest` | Auth |
| `UserAnimeListEntry`, `UserAnimeBookmark` | Shikimori list cache |
| `UserWatchProgress` | Watch position |
| `UserNotificationPreferences`, `UserNotificationLink`, `NotificationDelivery` | Notification settings, links, delivery log |
| `DiscordSettings`, `NotificationSettings`, `SiteSettingsDefaults`, `TranslationIntroSettings`, `WatchHistorySettings`, `WatchPartySettings`, `AppPromoSettings` | Admin-configurable settings |
| `KodikImportJob`, `KodikSyncRun`, `KodikSyncSettings` | Import/sync state |
| `DbBackupSettings`, `DbBackupRun` | WebDAV cloud backup settings + run history |
