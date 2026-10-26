# Track Anime — AI Context

Quick reference for AI assistants working on this codebase. Shared by Codex and Cursor.

## Assistant Entrypoints

| Tool | Entrypoint | Notes |
|------|------------|-------|
| Codex | `AGENTS.md` | Primary Codex rules; also read this file and `AI_RULES.md` |
| Cursor | `.cursorrules` + `.cursor/rules/` | Cursor entrypoint; helpers include `multi-task-dispatcher` and project skills below; also read this file and `AI_RULES.md` |
| Hermes | `.hermes.md` | Hermes-only auto context (does not replace Cursor/Codex files); also read this file, `AI_RULES.md`, and skill `track-anime` |
| Any AI | `PROJECT_OVERVIEW.md` → linked docs | Start here for full project onboarding |

### Cursor project skills (`.cursor/skills/`)

| Skill | When |
|-------|------|
| `ta-dispatcher` | Multi-topic request → themed start files; deploy last |
| `ta-deploy` | Prod deploy + changelog; user usually QA on prod after ship |
| `ta-debug` | Dev + prod; empty feed / OAuth / 502 — local DB may be stale |
| `ta-player` | Kodik / TA Plus / CVH / skip / watch party |
| `ta-posters` | Covers, `/api/cover`, thumb vs full |
| `ta-lists-sync` | Favorites, rewatches, Shikimori list sync |
| `ta-docs-sync` | Documentation impact after behavior changes |
| `ta-invariants-gate` | Pre-merge / pre-deploy invariant checklist |

MCP setup: `.cursor/MCP.md` (`sshpilot`, local read-only `postgres`, `context7`).

## What This Project Is

Next.js anime streaming site with Shikimori OAuth + Kodik player. Data lives in PostgreSQL. External APIs called only from server.

## Critical Paths

| Task | Start here |
|------|------------|
| Fix auth/login | `src/lib/auth/shikimori-oauth.ts`, `src/lib/auth/local-credentials.ts`, `src/lib/auth/qr-login.ts`, `src/app/api/auth/callback/shikimori/route.ts` |
| Fix player | `src/components/anime/KodikPlayer.tsx`, `KodikPlayerBetaViewport.tsx`, `TaPlusPlayer.tsx`, `VideoAmbientGlow.tsx`, `src/lib/player-ambient-glow.ts`, `src/lib/kodik-player-api.ts`, `src/lib/kodik-ftor.ts`, `src/hooks/useTaPlusStream.ts`, `CvhWatchSection.tsx`, `src/lib/cvh-player.ts`, `src/lib/anime-watch-share.ts`, `HentaiOceanPlayer.tsx`, `src/lib/hentai-ocean.ts`, `AdultContentConsentModal.tsx` |
| Fix watch party | `src/hooks/useWatchParty.ts`, `scripts/watch-party-server.mjs`, `scripts/watch-party-history.mjs`, `src/components/anime/AnimeWatchPanel.tsx`, `src/lib/admin/watch-party-history.ts` |
| Fix home feed | `src/lib/releases.ts`, `src/lib/home-feed-cache.ts`, `src/components/ReleaseFeed.tsx`, `src/lib/home-novelties.ts`, `HomeNoveltiesSection.tsx` |
| Fix release card / hover / mobile sheet | `ReleaseCard.tsx`, `AnimeCardHoverShell.tsx`, `ReleaseCardHoverPanel.tsx`, `ReleaseCardMobileSheet.tsx`, `ReleaseCardPreviewMeta.tsx`, `ReleaseCardQuickActions.tsx` — long-press sheet on any touch (incl. tablet desktop cards / finger-as-mouse); CSS blocks callout/select on poster; no `md:hidden` on sheet |
| Fix calendar | `src/lib/calendar.ts`, `src/components/calendar/CalendarView.tsx`, `src/lib/shikimori/calendar-api.ts` |
| Fix history cards | `src/components/history/HistoryWatchCard.tsx`, `src/lib/history-watch-card.ts`, `HistoryView.tsx` — единый UI для /history и «Новое в вашей истории»; на `/history` вкладки «Актуальные» / «Просмотрено» / «Отложено» / «Брошено» (по умолчанию без completed/on_hold/dropped) |
| Fix history upcoming | `src/lib/history-upcoming-soon.ts`, `HistoryUpcomingSoonPanel.tsx` — блок «Скоро выйдут» на `/history` и на главной над «Новое в вашей истории» (если count > 0; озвучка: last ep + 7д, окно 12ч) |
| Fix anime page | `src/lib/anime-page.ts`, `src/app/anime/[shikimoriId]/page.tsx` |
| Fix lists/favorites | `src/app/user/[shikimoriId]/favorites/page.tsx`, `FavoritesView.tsx`, `src/lib/favorites-sync.ts`, `src/lib/shikimori/user-list-mutations.ts` |
| Fix search | `src/lib/search.ts` (server-only, raw SQL) |
| Anime catalog backfill | `AnimeCatalog` + `npm run anime-catalog:backfill`; Grok prompt `docs/migration/GROK_ANIME_CATALOG_BACKFILL_PROMPT.md` |
| Fix import/sync | `src/lib/admin/kodik-sync.ts`, `scripts/kodik-import-full.ts` |
| Fix MAL ID / AniSkip mapping | `src/lib/admin/mal-id-sync.ts`, `src/lib/shikimori/mal-id.ts`, `src/lib/aniskip.ts`, `MalIdSyncPanel.tsx` |
| Fix posters | `src/lib/poster.ts`, `AnimePoster.tsx`, `src/lib/cover-cache.ts`, `src/lib/poster-fallback.ts`, `src/lib/admin/cover-cache-settings.ts`, `src/app/api/cover/route.ts`, `/admin/covers` |
| Fix notifications | `src/lib/notifications/`, `src/app/api/notifications/`, `scripts/notification-worker.ts` |
| Fix companion | `src/components/companion/AquaCoderCompanion.tsx`, `src/lib/companion/AquaCoderCanvas.ts`, `src/lib/companion/companion-bus.ts`, `src/lib/site-settings.ts` (`companionEnabled` local + `companionDisabledForAccount` synced, `isCompanionEnabledInSettings`), `public/companion/aqua-coder-chibi/`, `aqua-coder-web/` |
| Holiday theme | `src/lib/holiday-theme.ts` + `holiday-theme-types.ts`, админка `/admin/holidays` (`HolidayThemeSettings` / `holiday-theme-settings.ts`), публично `GET /api/holiday-theme`, декор `HalloweenDecor.tsx`, user `holidaysEnabled` local (default on), admin preview `holidayAdminForceId`; макет: `preview/holidays/` |
| Fix admin | `src/lib/auth/admin.ts`, `src/app/admin/` |
| Fix DB WebDAV backup | `src/lib/admin/db-backup.ts`, `db-backup-settings.ts`, `db-backup-webdav.ts`, `DbBackupSettingsPanel.tsx`, `/admin/db`, cron в `kodik-sync-scheduled.ts` |
| Fix app promo | `src/lib/admin/app-promo-settings.ts`, `AndroidAppPromoPrompt.tsx`, `DesktopAppPromoPrompt.tsx`, `/admin/app-promo` |
| Fix audience analytics | `src/lib/analytics/track.ts`, `src/lib/admin/audience-stats.ts`, `src/lib/admin/watch-share-log.ts`, `WatchShareLogPanel.tsx`, `src/app/admin/audience/`, `WatchPartyStatsPanel.tsx`, `src/components/SiteAnalyticsBeacon.tsx` |
| Fix «Что нового» / changelog UI | `src/lib/site-changelog.ts` (`listCompletedSiteChangelogEntries`), `src/app/api/site-changelog/route.ts`, `SiteChangelogWhatsNewModal.tsx`, `SiteChangelogEntries.tsx`, `ChangelogSettingsTab.tsx`, `site-settings.ts` (`lastSeenChangelogDayId`, `showWhatsNewChangelog`), `?whatsNew=1` |

## Request routing (multi-task / dispatcher)

При широком запросе («UI + обложки + деплой») — сначала разложить задачу по таблице ниже, **deploy последним**.

Cursor: использовать `.cursor/rules/multi-task-dispatcher.mdc` и skill `ta-dispatcher`.
Codex: использовать эту таблицу напрямую и читать реальные стартовые файлы.

| Тема | Ключевые слова | Стартовые файлы |
|------|----------------|-----------------|
| Mobile UI | мобильн, UI, header, nav, избранн | `FavoritesView.tsx`, `Header.tsx`, `PwaBottomNav.tsx`, `globals.css` |
| Anime page | lightbox, player expand, trailer, screenshots | `AnimePageView.tsx`, `AnimeWatchPanel.tsx`, `KodikPlayer.tsx`, `KodikPlayerBetaViewport.tsx` |
| Covers / posters | обложк, poster, thumb, cover | `AnimePoster.tsx`, `src/lib/poster.ts`, `cover-cache.ts`, `poster-fallback.ts`, `cover-cache-settings.ts`, `src/app/api/cover/route.ts` |
| Lists / sync | списк, sync, rewatches, shikimori | `favorites-sync.ts`, `user-list-mutations.ts` |
| Player | kodik, taplus, ta plus, cvh, videohub, плеер, progress, theater, по высоте, ambient, подсветк | `KodikPlayer.tsx`, `KodikPlayerBetaViewport.tsx`, `TaPlusPlayer.tsx`, `VideoAmbientGlow.tsx`, `player-ambient-glow.ts`, `TaPlusIdleBackdrop.tsx`, `hooks/useTaPlusStream.ts`, `ta-plus-tiles.ts`, `ta-plus-previews.ts`, `CvhWatchSection.tsx`, `kodik-player-api.ts`, `kodik-ftor.ts`, `cvh-player.ts`, `globals.css` |
| Deploy | деплой, deploy, prod | **Сначала** `data/site-changelog.json` (user-facing; суточная группировка Europe/Moscow; `.cursor/rules/deploy-changelog.mdc`), затем **`npm run deploy:smart`** (канал сам; не спрашивать webhook/Actions/SSH), `deploy-auto.ps1`, `git-deploy.ts`, `.github/workflows/deploy.yml`, `docs/DEPLOY.md` |
| Auth | oauth, login, session | `shikimori-oauth.ts`, `src/app/api/auth/` |
| Home feed | главная, лента, новинки | `releases.ts`, `home-feed-cache.ts`, `ReleaseFeed.tsx`, `home-novelties.ts`, `HomeNoveltiesSection.tsx` |
| Notifications | уведомлен, push, telegram, vk, discord | `src/lib/notifications/`, `src/app/api/notifications/`, `NotificationSettingsPanel.tsx` |
| Brand rotation | лого, логотип, favicon, бренд | `src/lib/brand-rotation.ts`, `src/components/admin/BrandRotationSettingsPanel.tsx`, `public/brand-logos/` |
| Android TV | android tv, d-pad, тв-навигац, watch next, continue watching, нативный плеер | `TvNavigationProvider.tsx`, `tv-navigation.ts`, `android-watch-next.ts`, `WatchNextPublisher.java`, `PlayerActivity.java`, `android-app.ts`, `BaseWebActivity.java`, `docs/ANDROID.md` |
| Windows app | windows app, webview2, win shell | `windows/TrackAnime/`, `src/lib/windows-app.ts`, `docs/WINDOWS.md` |
| Devices / last tab | устройства, вкладки, resume, handoff | `DevicePresenceRecorder.tsx`, `DevicePresenceModal.tsx`, `src/lib/device-presence.ts`, `/admin/device-presence` |

## Shikimori sync policy (lists)

| Action | Shikimori | Local TA |
|--------|-----------|----------|
| +1 rewatch (`rewatch: true`) | PATCH, `rewatches++` | from API response |
| Manual rewatches in favorites UI | not sent | Prisma only |
| Sync pull (upsert update) | status, score, episodes, dates | **rewatches not overwritten** on update |
| Watch progress (Kodik) | not synced | `UserWatchProgress` only |

**Canon vs snapshot:** rows `UserAnimeListEntry` / `UserAnimeBookmark` are the local canon (badges, mutations, profile stats). `UserListSync.ratesSnapshot` / `bookmarksSnapshot` are a full-list response cache written only on successful full sync; point mutations call `invalidateFavoritesListSnapshot` (null) so favorites fall back to rows until the next sync. Persist uses one bulk `INSERT … ON CONFLICT`, not N Prisma upserts.

Details: `DECISIONS.md`, если файл присутствует. Если файла нет — считать таблицу выше текущей зафиксированной политикой и писать `ФАЙЛ НЕ НАЙДЕН: DECISIONS.md` при ссылке на него.

## Hidden Assumptions

1. **proxy.ts** — redirects legacy `?shikimori_id=` → `/anime/{id}`; production mirrors are handled by nginx, auth is per-route, not global
2. **Shikimori ID is the URL key** — not internal DB id, not kodikId
3. **KodikMaterial = one translation** — multiple materials per anime
4. **Watch progress is per shikimoriId** — not per translation
5. **Last-episode «Просмотрено» banner** — armed when watch-history returns `cleared`; shown on pause or TA fullscreen exit; does not auto-set `completed`
6. **First-episode «Смотрю» banner** — armed when S1E1 progress passes 50% of player duration; shown on pause or TA fullscreen exit; does not auto-set `watching`; skipped for movies (`episodesTotal ≤ 1`) and existing watching/rewatching/completed
7. **Auth session refresh must keep `user` identity** — `AuthProvider` refreshes on focus/visibility; equal users must not get a new object or `AnimeWatchPanel` boot remounts the player
8. **Feed requires sync** — empty home = no KodikEpisodeRelease rows
9. **OAuth User-Agent** — must match Shikimori app name (`SHIKIMORI_APP_NAME`)
10. **Redirect URI** — must exactly match Shikimori OAuth app settings
11. **Shikimori host** — configurable (`.io` vs `.one`), stored in DB
12. **CLI scripts use own PrismaClient** — not always the singleton
13. **Russian UI** — user-facing strings are Russian

## Data Flow Shortcuts

```
Home:  KodikEpisodeRelease → home-feed-cache (HomeFeedItem) → releases.ts → ReleaseFeed (visible-tab poll live=1, 60s + stale-on-resume 60s via useVisiblePoll); history/upcoming/novelties → HomeLiveRefresh router.refresh (5min / same stale); novelties → home-novelties.ts (24h cache) → HomeNoveltiesSection
Anime: shikimoriId → anime-page.ts → Shikimori API + KodikMaterial DB
Player: playerLink → KodikPlayer iframe → postMessage → watch-history API; TA player watch party → `useWatchParty` → WebSocket server
Skip times: AnimeWatchPanel → /api/anime/[shikimoriId]/skip-times → aniskip.ts → AniSkip + DB cache → manual/auto OP/ED skip
Lists: favorites-sync.ts → Shikimori user_rates → bulk UserAnimeListEntry (+ optional UserListSync snapshot cache)
Notifications: preferences + links → notification-worker.ts → browser/FCM/Discord/Telegram/VK + in-app feed
Calendar: `/calendar` → calendar.ts → local Kodik DB or Shikimori `/api/calendar` → CalendarView
```

## Environment Variables (must-know)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `KODIK_API_TOKEN` | Kodik API access |
| `SHIKIMORI_CLIENT_ID/SECRET` | OAuth |
| `AUTH_URL` | Public site URL for OAuth redirects |
| `ADMIN_SHIKIMORI_IDS` | Bootstrap admin users |
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` or `FCM_SERVICE_ACCOUNT_FILE` | Firebase Cloud Messaging for Android APK background push |
| `WATCH_PARTY_PORT` / `NEXT_PUBLIC_WATCH_PARTY_WS_URL` | Optional WebSocket room server port / public client URL for beta совместный просмотр |

## Frequent Pitfalls

| Problem | Likely cause |
|---------|--------------|
| Banner «Сайт обновился» mid-deploy / reload → down | `/api/site-build` must use process-cached fingerprint; deploy writes `.build-number` only after `systemctl stop`; ClientUpdateGuard confirms + waits before reload |
| Cloudflare 502 during deploy / outage | `maintenance.on` → **503** + `maintenance.html` (updating); Next down without flag → **502** + `unavailable.html` (contacts). Wired in `track-anime-proxy.conf` + `server-deploy.sh` |
| Empty home feed | No sync run — `npm run kodik:sync` |
| «Новинки» без 2-го сезона / пусто | Не путать с бейджем NEW (эпизоды 1–3). Блок: ≤5 серий (`GREATEST(episodes_aired, № серии)`) + `releasedAt`≤30д + `aired_on`≤90д, любой `seasonNumber`; кеш 24ч — сброс в `/admin/import` |
| Тайтл с 6+ сериями в «Новинках» | У озвучки устаревший `episodes_aired`; порог обязан учитывать номер серии в релизе (`home-novelties.ts`) |
| Admin stale-DB banner | Sync older than 2h — check cron / `kodik-sync.log`; preview `/?adminSyncBannerPreview=1` |
| OAuth fails | Redirect URI mismatch, HTTP instead of HTTPS in prod |
| 401 on list update | Expired Shikimori token — баннер «Связь с Shikimori истекла — переподключите» / `auth-client.ts` refresh |
| Anime page 404 | Invalid shikimoriId or no Shikimori data |
| No player | No KodikMaterial for shikimoriId — page auto-ensures via Kodik search; import/sync use `anime,anime-serial` (films are `type=anime`) |
| No Kodik player | No `playerLink`: 18+ → Hentai Ocean (`hentai-ocean.ts`, needs `adultContentEnabled`); else client mounts VideoHUB solo (`CvhWatchSection` / plapi). No Kodik → no `UserWatchProgress` from CVH |
| Rate limit errors | Shikimori/Kodik rate limiter — check `rate-limiter.ts` |
| Poster missing | Fallback chain exhausted — check materialData, Shikimori cache |
| Anime page poster ≠ lightbox | Страница должна быть `size="full"` на том же `/api/cover?id=` что lightbox; не `size=thumb` (разный browser cache). Cover без `immutable` |
| Import stuck | Check `KodikImportJob` status in DB or admin panel |
| Session lost | Cookie host-only (другой mirror в браузере), год без визитов (TTL 1г + sliding), или wipe cookie в оболочке при sync с пустого хоста (исправлено); debug: `Session` + `ta.session` |
| In-app flood on phone/PC reopen | Per-device `localStorage` since without account cursor, or catch-up without progress filter — check `inAppNotifySince` + `rebuild-payload.ts` |
| Android closed-app push missing | Need FCM env on server + readable SA JSON (`www-data`) + user toggle «Уведомления Android» (or first-run banner in shell); Web Push does not work in WebView shell |
| Phone dev: no JS, TitleCover only | Open via LAN IP without `allowedDevOrigins` — restart `npm run dev`, use `http://192.168.x.x:3000` |
| `dygdyg:3000` unreachable | Add `192.168.x.x dygdyg` to hosts; dev must bind `0.0.0.0` (`npm run dev`) |
| Brand logo does not rotate | No `.webp` files in `public/brand-logos`, `BrandRotationSettings.enabled=false`, or interval slot has not changed yet |
| Android TV lag / blur | Full desktop UI in WebView; TV sets `data-tv-nav` which disables blur/companion — check inject in `BaseWebActivity.enableTvSiteNavigation` |
| Kodik video freezes, audio continues | GPU pressure from page chrome (screenshot `blur-md`, pattern parallax, companion RAF) or React thrash on `time_update`. Playback sets `data-player-playing`; panel skips position-only state updates (timeline in beta viewport; skip clock from `liveProgressRef`); focus reclaim is event-driven not polling; refresh / «Перезапустить плеер» remounts iframe |
| Legacy Kodik iframe has no episode list | Embed is `/seria/` (single episode). Legacy mode must stay on `/serial/`/`/season/` — see `allowSeriaRemount` in `player-url.ts` / `AnimeWatchPanel` |
| TV search opens IME on focus | HeaderSearch idle uses wrapper `data-tv-focus`; OK/Enter required to edit |
| Title search miss on synonym/описка | Id-first ILIKE по `AnimeTitleAlias`/`AnimeCatalog`; empty → material fallback → layout → strict/partial fuzzy |
| Search hangs / «Расширение территории» | Title id-first (не seq scan Kodik); fuzzy по SQL-seed кандидатам; добор description с catalog; trgm: `scripts/search-trgm-indexes.sql` |
| Cold search still 5s+ after deploy | На Postgres не применён `scripts/search-trgm-indexes.sql` или catalogGaps > 0 |
| Search «Нет плеера» / фильтр | `hasPlayer` = non-empty `KodikMaterial.playerLink`; URL `player=with` только с плеером |
| Catalog gaps after deploy | `npm run anime-catalog:backfill:status` — `catalogGaps` должен быть 0 |
| App settings dialog ignores D-pad | Native dialog needs focus drawables + `requestFocus` — see `showAppSettings` |
| TV player arrows move focus instead of seek | Center Play has `data-tv-player-seek-keys`; arrows seek / jump chrome — see `KodikPlayerBetaViewport` |
| TA Plus bottom bar before play | Idle hides bottom controls (no synthetic scrub); episode strip + Continue/play stay until HLS mounts |
| TA Plus play shows UI but no video | `initialResume`/`taPlusSeekSeconds` must not reload HLS after ready — boot seek is captured once in `TaPlusPlayer` |
| Ambient glow on non-ultrawide / windowed | Button + runtime only if `screen` AR > 16:9 and native fullscreen; settings JSON `ta:player-ambient-glow` may stay enabled while runtime unmounts (`VideoAmbientGlow`) so there is no canvas load |
| Ambient glow invisible in FS pillarbox | `<video bg-black>` covers letterbox over `VideoAmbientGlow` — use `bg-transparent` while glow active; paint one still frame on activate even if paused |
| Ambient glow + video fit cover | `object-cover` fills the box and hides pillarbox glow — force `contain` while `ambientGlowActive`; disable fit button; LS `track-anime:ta-plus-video-fit` kept |
| Thin black strip on FS right edge | Often `html { scrollbar-gutter: stable }` + `100dvw`; FS disables gutter (`html:has(:fullscreen)`) and uses `%` widths; keep TaPlus overflow clipped when glow scales |
| TA Plus no OP/ED skip button | Skip-times used to clear when HLS duration briefly hits 0; fetch uses last-good/1440 fallback (`skipTimesEpisodeLength`) |
| TA Plus prefer parser skips | If `/ftor` returns `skip_timings`/`skip_raw`, TA Plus uses them instead of AniSkip (`kodik-parser-skip.ts`) |
| TA Plus scrub tiles 404 / black | Kodik `{index}` is 1-based 4-digit (`0001`); bare `0`/`1` is wrong — see `formatTaPlusTileSheetIndex` in `ta-plus-tiles.ts`. Also `%7Bindex%7D` from `/ftor` must be normalized (`normalizeTaPlusTilePattern`) or every sheet 404s |
| TA Plus scrub/seek preview slow | Sheets should warm via `preloadTaPlusTileSheets` when `tiles` arrive (`KodikPlayerBetaViewport`); check `/api/taplus-tile` |
| Viewport click pauses while chrome hidden | `handleViewportClick`: hidden UI → `revealUi` only; play/pause only when `uiVisible` |
| TA Plus white stub on episode switch | Empty `<video>` after `load()` — set `poster` + cover overlay until first frame (`TaPlusPlayer`) |
| TA Plus hang / safe mode | After ~5s stall (or fatal HLS) offer progressive MP4: cut URL at `.mp4` (`ta-plus-safe-mode.ts`, `TaPlusPlayer`) |
| TA Plus safe-mode but CDN OK | Apex `cloudN.solodcdn.com` often blocked in browsers; rewrite to `lynx.cloudN.solodcdn.com` in `preferSolodcdnBrowserEdge` (`kodik-ftor.ts`). `refresh=1` alone returns the same hour-stamped paths |
| TA Plus dead HLS after retry | Client reload must use `/taplus?refresh=1` so `kodik-ftor` drops in-memory cache; plain GET re-serves same CDN URLs until hour stamp |
| TA Plus safe-mode before refresh | Offer progressive MP4 only after one silent `refresh=1` for the episode failed again (`TaPlusPlayer` `silentRefreshDoneRef`) |
| TA Plus Auto stuck at 480p | Use optimistic `abrEwmaDefaultEstimate` + `startLevel=max` on synthetic master; don't lock Auto to a single max URL |
| Cold start plays last episode, strip unhighlighted | No history → `resolveFirstPlayableEpisode`; taplus must not use material `/serial/` (Kodik last_episode) |
| Tablet cards look desktop, no preview popup | Hover panel needs mouse; sheet used to be `md:hidden`. Long-press opens sheet on touch even at `md+` (`AnimeCardHoverShell` + `ReleaseCardMobileSheet`) |

## Debugging Notes

```bash
# DB check
npm run db:studio

# Manual sync
npm run kodik:sync

# Full import
npm run kodik:import

# Resume interrupted import
npm run kodik:import:resume

# Debug scripts
node scripts/debug-user-rates.mjs
node scripts/debug-history-new.mjs
tsx scripts/check-poster.ts <shikimoriId>
npm run shikimori:malid-stats -- --refresh --limit=100
npm run watch-party:server
```

**Import job status:** `KodikImportJob` where `id = "full"`.

**Sync history:** `KodikSyncRun` table, also visible in admin.

**Session debug:** check `Session` table + `ta.session` cookie value.

## Files NOT to confuse

| File | Note |
|------|------|
| `src/lib/admin/kodik-import.ts` | Episodes import logic |
| `src/lib/admin/kodik-import.js` | Compiled copy for CLI |
| `scripts/kodik-import-full.ts` | Full import CLI entry |
| `src/db/save-material.ts` | DB upsert for Kodik data |
| `src/kodik/client.ts` | HTTP client (not in lib/) |

## Schema Quick Reference

- `KodikMaterial.kodikId` — PK, Kodik's id
- `KodikMaterial.shikimoriId` — link to Shikimori
- `User.shikimoriId` — unique, from OAuth
- `LocalCredential` — optional local login (case-preserved) + `loginNormalized` + password hash for the same `User`
- `QrLoginRequest` — one-time QR approval state; the QR itself never contains a session token
- `QrCodeScanner` — webcam QR scan via `getUserMedia`; native `BarcodeDetector` when available, otherwise `jsQR` (desktop Chrome)
- `UserWatchProgress` — unique (userId, shikimoriId)
- `WatchPartySettings` — global TA-плеер совместный просмотр toggles
- `AppPromoSettings` — soft-promo приложений: `enabled` (mobile) + `desktopEnabled` (PC)
- `KodikEpisodeRelease` — home feed source
- `UserNotificationPreferences`, `UserNotificationLink`, `NotificationDelivery` — notifications state
- `AnimeExternalIdMap` — server-side external ID cache (`shikimoriId -> malId`)
- `AnimeEpisodeSkipTime` — AniSkip OP/ED/recap cache by shikimoriId/season/episode/length

## When Adding Features

1. Find similar implementation first (see CONVENTIONS.md)
2. Server data in `src/lib/`, API in `src/app/api/`
3. Client UI in `src/components/`
4. Keep auth per route via `getSession()` / `requireAdmin*()`; `src/proxy.ts` is only for the legacy query redirect
5. Don't call external APIs from client components
6. Run documentation impact check and update only affected doc sections if behavior changes

## Documentation Impact Check

For every code change, decide whether documentation must be updated.

| Change | Likely docs |
|--------|-------------|
| Route/page/module/script/schema added or moved | `CODEBASE_MAP.md` |
| Architecture or data pipeline changed | `ARCHITECTURE.md` |
| User-visible behavior or business rule changed | `BUSINESS_LOGIC.md`, `PROJECT_OVERVIEW.md` |
| Critical path, pitfall, invariant changed | `AI_CONTEXT.md`, `AGENTS.md` |
| Env/npm/deploy/setup changed | `.env.example`, `README.md`, `docs/SERVER.md`, `docs/DEPLOY.md` |
| Kodik/Shikimori request behavior changed | `docs/kodik-api/`, `docs/shikimori-api/` |
| Pattern/convention changed | `CONVENTIONS.md` |

Final response should include either changed docs or `Docs: not needed`.

## AI workflow

- Codex: follow `AGENTS.md`, then this file, then task-specific docs/code.
- Cursor: follow `.cursorrules`, then `.cursor/rules/` (always-on), then this file, then task-specific docs/code.
- Hermes: follow `.hermes.md` (auto), then this file / `AI_RULES.md` / task docs; skill `track-anime` for deploy/dispatcher shortcuts. Do not edit `.cursor/**` unless asked.
- Multi-topic requests: use the request routing table above; Cursor also has `.cursor/rules/multi-task-dispatcher.mdc` and skill `ta-dispatcher` (plus domain skills `ta-deploy` / `ta-player` / …); Hermes uses the same table via `.hermes.md` / skill `track-anime`.
- Decisions log: `DECISIONS.md` if present.
- Ignore for indexing: `.cursorignore` / tool-specific excludes for `.next/`, `node_modules/`, caches.

## Extended Docs

- `docs/kodik-api/` — Kodik API reference
- `docs/shikimori-api/` — Shikimori API reference
- `docs/KodikSyncDocumentation.md` — sync details
- `docs/SERVER.md` — production setup
