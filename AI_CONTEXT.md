# Track Anime — AI Context

Quick reference for AI assistants working on this codebase. Shared by Codex and Cursor.

## Assistant Entrypoints

| Tool | Entrypoint | Notes |
|------|------------|-------|
| Codex | `AGENTS.md` | Primary Codex rules; also read this file and `AI_RULES.md` |
| Cursor | `.cursorrules` + `.cursor/rules/` | Cursor entrypoint; helpers include `multi-task-dispatcher` and skill `ta-dispatcher`; also read this file and `AI_RULES.md` |
| Any AI | `PROJECT_OVERVIEW.md` → linked docs | Start here for full project onboarding |

## What This Project Is

Next.js anime streaming site with Shikimori OAuth + Kodik player. Data lives in PostgreSQL. External APIs called only from server.

## Critical Paths

| Task | Start here |
|------|------------|
| Fix auth/login | `src/lib/auth/shikimori-oauth.ts`, `src/lib/auth/local-credentials.ts`, `src/lib/auth/qr-login.ts`, `src/app/api/auth/callback/shikimori/route.ts` |
| Fix player | `src/components/anime/KodikPlayer.tsx`, `src/lib/kodik-player-api.ts` |
| Fix watch party | `src/hooks/useWatchParty.ts`, `scripts/watch-party-server.mjs`, `src/components/anime/AnimeWatchPanel.tsx` |
| Fix home feed | `src/lib/releases.ts`, `src/components/ReleaseFeed.tsx` |
| Fix calendar | `src/lib/calendar.ts`, `src/components/calendar/CalendarView.tsx`, `src/lib/shikimori/calendar-api.ts` |
| Fix history cards | `src/components/history/HistoryWatchCard.tsx`, `src/lib/history-watch-card.ts` — единый UI для /history и «Новое в вашей истории» |
| Fix history upcoming | `src/lib/history-upcoming-soon.ts`, `HistoryUpcomingSoonPanel.tsx` — блок «Скоро выйдут» на `/history` и на главной над «Новое в вашей истории» (если count > 0; озвучка: last ep + 7д, окно 12ч) |
| Fix anime page | `src/lib/anime-page.ts`, `src/app/anime/[shikimoriId]/page.tsx` |
| Fix lists/favorites | `src/lib/favorites-sync.ts`, `src/lib/shikimori/user-list-mutations.ts` |
| Fix search | `src/lib/search.ts` (server-only, raw SQL) |
| Fix import/sync | `src/lib/admin/kodik-sync.ts`, `scripts/kodik-import-full.ts` |
| Fix MAL ID / AniSkip mapping | `src/lib/admin/mal-id-sync.ts`, `src/lib/shikimori/mal-id.ts`, `src/lib/aniskip.ts`, `MalIdSyncPanel.tsx` |
| Fix posters | `src/lib/poster.ts`, `AnimePoster.tsx`, `src/lib/cover-cache.ts`, `src/app/api/cover/route.ts` |
| Fix notifications | `src/lib/notifications/`, `src/app/api/notifications/`, `scripts/notification-worker.ts` |
| Fix companion | `src/components/companion/AquaCoderCompanion.tsx`, `src/lib/companion/AquaCoderCanvas.ts`, `src/lib/companion/companion-bus.ts`, `public/companion/aqua-coder-chibi/`, `aqua-coder-web/` |
| Fix admin | `src/lib/auth/admin.ts`, `src/app/admin/` |

## Request routing (multi-task / dispatcher)

При широком запросе («UI + обложки + деплой») — сначала разложить задачу по таблице ниже, **deploy последним**.

Cursor: использовать `.cursor/rules/multi-task-dispatcher.mdc` и skill `ta-dispatcher`.
Codex: использовать эту таблицу напрямую и читать реальные стартовые файлы.

| Тема | Ключевые слова | Стартовые файлы |
|------|----------------|-----------------|
| Mobile UI | мобильн, UI, header, nav, избранн | `FavoritesView.tsx`, `Header.tsx`, `PwaBottomNav.tsx`, `globals.css` |
| Anime page | lightbox, player expand, trailer, screenshots | `AnimePageView.tsx`, `AnimeWatchPanel.tsx`, `KodikPlayer.tsx` |
| Covers / posters | обложк, poster, thumb, cover | `AnimePoster.tsx`, `src/lib/poster.ts`, `cover-cache.ts`, `src/app/api/cover/route.ts` |
| Lists / sync | списк, sync, rewatches, shikimori | `favorites-sync.ts`, `user-list-mutations.ts` |
| Player | kodik, плеер, progress | `KodikPlayer.tsx`, `kodik-player-api.ts` |
| Deploy | деплой, deploy, prod | `scripts/deploy-auto.ps1`, `deploy.ps1`, `deploy-rpc.ps1`, `deploy-apk.ps1`, `deploy-windows-app.ps1`, `docs/DEPLOY.md` |
| Auth | oauth, login, session | `shikimori-oauth.ts`, `src/app/api/auth/` |
| Home feed | главная, лента | `releases.ts`, `ReleaseFeed.tsx` |
| Notifications | уведомлен, push, telegram, vk, discord | `src/lib/notifications/`, `src/app/api/notifications/`, `NotificationSettingsPanel.tsx` |
| Brand rotation | лого, логотип, favicon, бренд | `src/lib/brand-rotation.ts`, `src/components/admin/BrandRotationSettingsPanel.tsx`, `public/brand-logos/` |
| Android TV | android tv, d-pad, тв-навигац | `TvNavigationProvider.tsx`, `tv-navigation.ts`, `HeaderSearch.tsx`, `BaseWebActivity.java`, `docs/ANDROID.md` |
| Windows app | windows app, webview2, win shell | `windows/TrackAnime/`, `src/lib/windows-app.ts`, `docs/WINDOWS.md` |

## Shikimori sync policy (lists)

| Action | Shikimori | Local TA |
|--------|-----------|----------|
| +1 rewatch (`rewatch: true`) | PATCH, `rewatches++` | from API response |
| Manual rewatches in favorites UI | not sent | Prisma only |
| Sync pull (upsert update) | status, score, episodes, dates | **rewatches not overwritten** on update |
| Watch progress (Kodik) | not synced | `UserWatchProgress` only |

Details: `DECISIONS.md`, если файл присутствует. Если файла нет — считать таблицу выше текущей зафиксированной политикой и писать `ФАЙЛ НЕ НАЙДЕН: DECISIONS.md` при ссылке на него.

## Hidden Assumptions

1. **proxy.ts** — redirects legacy `?shikimori_id=` → `/anime/{id}`; production mirrors are handled by nginx, auth is per-route, not global
2. **Shikimori ID is the URL key** — not internal DB id, not kodikId
3. **KodikMaterial = one translation** — multiple materials per anime
4. **Watch progress is per shikimoriId** — not per translation
5. **Feed requires sync** — empty home = no KodikEpisodeRelease rows
6. **OAuth User-Agent** — must match Shikimori app name (`SHIKIMORI_APP_NAME`)
7. **Redirect URI** — must exactly match Shikimori OAuth app settings
8. **Shikimori host** — configurable (`.io` vs `.one`), stored in DB
9. **CLI scripts use own PrismaClient** — not always the singleton
10. **Russian UI** — user-facing strings are Russian

## Data Flow Shortcuts

```
Home:  KodikEpisodeRelease → releases.ts → ReleaseFeed
Anime: shikimoriId → anime-page.ts → Shikimori API + KodikMaterial DB
Player: playerLink → KodikPlayer iframe → postMessage → watch-history API; TA player watch party → `useWatchParty` → WebSocket server
Skip times: AnimeWatchPanel → /api/anime/[shikimoriId]/skip-times → aniskip.ts → AniSkip + DB cache → manual/auto OP/ED skip
Lists: favorites-sync.ts → Shikimori user_rates → UserAnimeListEntry
Notifications: preferences + links → notification-worker.ts → browser/Discord/Telegram/VK + in-app feed
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
| `WATCH_PARTY_PORT` / `NEXT_PUBLIC_WATCH_PARTY_WS_URL` | Optional WebSocket room server port / public client URL for beta совместный просмотр |

## Frequent Pitfalls

| Problem | Likely cause |
|---------|--------------|
| Empty home feed | No sync run — `npm run kodik:sync` |
| OAuth fails | Redirect URI mismatch, HTTP instead of HTTPS in prod |
| 401 on list update | Expired Shikimori token — check `auth-client.ts` refresh |
| Anime page 404 | Invalid shikimoriId or no Shikimori data |
| No player | No KodikMaterial for shikimoriId — page auto-ensures via Kodik search; import/sync use `anime,anime-serial` (films are `type=anime`) |
| Rate limit errors | Shikimori/Kodik rate limiter — check `rate-limiter.ts` |
| Poster missing | Fallback chain exhausted — check materialData, Shikimori cache |
| Import stuck | Check `KodikImportJob` status in DB or admin panel |
| Session lost | Cookie domain/path, or expired Session row |
| Phone dev: no JS, TitleCover only | Open via LAN IP without `allowedDevOrigins` — restart `npm run dev`, use `http://192.168.x.x:3000` |
| `dygdyg:3000` unreachable | Add `192.168.x.x dygdyg` to hosts; dev must bind `0.0.0.0` (`npm run dev`) |
| Brand logo does not rotate | No `.webp` files in `public/brand-logos`, `BrandRotationSettings.enabled=false`, or interval slot has not changed yet |
| Android TV lag / blur | Full desktop UI in WebView; TV sets `data-tv-nav` which disables blur/companion — check inject in `BaseWebActivity.enableTvSiteNavigation` |
| Kodik video freezes, audio continues | GPU pressure from page chrome (screenshot `blur-md`, pattern parallax, companion RAF). Playback sets `data-player-playing` to ease load; refresh / «Перезапустить плеер» remounts iframe |
| TV search opens IME on focus | HeaderSearch idle uses wrapper `data-tv-focus`; OK/Enter required to edit |
| App settings dialog ignores D-pad | Native dialog needs focus drawables + `requestFocus` — see `showAppSettings` |
| TV player arrows move focus instead of seek | Center Play has `data-tv-player-seek-keys`; arrows seek / jump chrome — see `KodikPlayerBetaViewport` |

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
- `LocalCredential` — optional local login/password hash for the same `User`
- `QrLoginRequest` — one-time QR approval state; the QR itself never contains a session token
- `UserWatchProgress` — unique (userId, shikimoriId)
- `WatchPartySettings` — global TA-плеер совместный просмотр toggles
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
- Multi-topic requests: use the request routing table above; Cursor also has `.cursor/rules/multi-task-dispatcher.mdc` and skill `ta-dispatcher`.
- Decisions log: `DECISIONS.md` if present.
- Ignore for indexing: `.cursorignore` / tool-specific excludes for `.next/`, `node_modules/`, caches.

## Extended Docs

- `docs/kodik-api/` — Kodik API reference
- `docs/shikimori-api/` — Shikimori API reference
- `docs/KodikSyncDocumentation.md` — sync details
- `docs/SERVER.md` — production setup
