# Track Anime — AI Context

Quick reference for AI assistants working on this codebase. Shared by Codex and Cursor.

## Assistant Entrypoints

| Tool | Entrypoint | Notes |
|------|------------|-------|
| Codex | `AGENTS.md` | Primary Codex rules; also read this file and `AI_RULES.md` |
| Cursor | `.cursorrules` | Cursor compatibility rules; also read this file and `AI_RULES.md` |
| Any AI | `PROJECT_OVERVIEW.md` → linked docs | Start here for full project onboarding |

## What This Project Is

Next.js anime streaming site with Shikimori OAuth + Kodik player. Data lives in PostgreSQL. External APIs called only from server.

## Critical Paths

| Task | Start here |
|------|------------|
| Fix auth/login | `src/lib/auth/shikimori-oauth.ts`, `src/app/api/auth/callback/shikimori/route.ts` |
| Fix player | `src/components/anime/KodikPlayer.tsx`, `src/lib/kodik-player-api.ts` |
| Fix home feed | `src/lib/releases.ts`, `src/components/ReleaseFeed.tsx` |
| Fix history cards | `src/components/history/HistoryWatchCard.tsx`, `src/lib/history-watch-card.ts` — единый UI для /history и «Новое в вашей истории» |
| Fix anime page | `src/lib/anime-page.ts`, `src/app/anime/[shikimoriId]/page.tsx` |
| Fix lists/favorites | `src/lib/favorites-sync.ts`, `src/lib/shikimori/user-list-mutations.ts` |
| Fix search | `src/lib/search.ts` (server-only, raw SQL) |
| Fix import/sync | `src/lib/admin/kodik-sync.ts`, `scripts/kodik-import-full.ts` |
| Fix posters | `src/lib/poster.ts`, `AnimePoster.tsx`, `src/lib/cover-cache.ts`, `src/app/api/cover/route.ts` |
| Fix admin | `src/lib/auth/admin.ts`, `src/app/admin/` |

## Request routing (multi-task / dispatcher)

При широком запросе («UI + обложки + деплой») — сначала разложить задачу по таблице ниже, **deploy последним**.

Cursor: если доступны `.cursor/rules/multi-task-dispatcher.mdc` или skill `ta-dispatcher`, можно использовать их как helper.
Codex: использовать эту таблицу напрямую и читать реальные стартовые файлы.

| Тема | Ключевые слова | Стартовые файлы |
|------|----------------|-----------------|
| Mobile UI | мобильн, UI, header, nav, избранн | `FavoritesView.tsx`, `Header.tsx`, `PwaBottomNav.tsx`, `globals.css` |
| Anime page | lightbox, player expand, trailer, screenshots | `AnimePageView.tsx`, `AnimeWatchPanel.tsx`, `KodikPlayer.tsx` |
| Covers / posters | обложк, poster, thumb, cover | `AnimePoster.tsx`, `src/lib/poster.ts`, `cover-cache.ts`, `src/app/api/cover/route.ts` |
| Lists / sync | списк, sync, rewatches, shikimori | `favorites-sync.ts`, `user-list-mutations.ts` |
| Player | kodik, плеер, progress | `KodikPlayer.tsx`, `kodik-player-api.ts` |
| Deploy | деплой, deploy, prod | `scripts/deploy.ps1`, `docs/DEPLOY.md` |
| Auth | oauth, login, session | `shikimori-oauth.ts`, `src/app/api/auth/` |
| Home feed | главная, лента | `releases.ts`, `ReleaseFeed.tsx` |

## Shikimori sync policy (lists)

| Action | Shikimori | Local TA |
|--------|-----------|----------|
| +1 rewatch (`rewatch: true`) | PATCH, `rewatches++` | from API response |
| Manual rewatches in favorites UI | not sent | Prisma only |
| Sync pull (upsert update) | status, score, episodes, dates | **rewatches not overwritten** on update |
| Watch progress (Kodik) | not synced | `UserWatchProgress` only |

Details: `DECISIONS.md`, если файл присутствует. Если файла нет — считать таблицу выше текущей зафиксированной политикой и писать `ФАЙЛ НЕ НАЙДЕН: DECISIONS.md` при ссылке на него.

## Hidden Assumptions

1. **middleware.ts** — redirects legacy `?shikimori_id=` → `/anime/{id}` and canonicalizes legacy host; auth is per-route, not global
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
Player: playerLink → KodikPlayer iframe → postMessage → watch-history API
Lists: favorites-sync.ts → Shikimori user_rates → UserAnimeListEntry
```

## Environment Variables (must-know)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `KODIK_API_TOKEN` | Kodik API access |
| `SHIKIMORI_CLIENT_ID/SECRET` | OAuth |
| `AUTH_URL` | Public site URL for OAuth redirects |
| `ADMIN_SHIKIMORI_IDS` | Bootstrap admin users |

## Frequent Pitfalls

| Problem | Likely cause |
|---------|--------------|
| Empty home feed | No sync run — `npm run kodik:sync` |
| OAuth fails | Redirect URI mismatch, HTTP instead of HTTPS in prod |
| 401 on list update | Expired Shikimori token — check `auth-client.ts` refresh |
| Anime page 404 | Invalid shikimoriId or no Shikimori data |
| No player | No KodikMaterial for shikimoriId — need import |
| Rate limit errors | Shikimori/Kodik rate limiter — check `rate-limiter.ts` |
| Poster missing | Fallback chain exhausted — check materialData, Shikimori cache |
| Import stuck | Check `KodikImportJob` status in DB or admin panel |
| Session lost | Cookie domain/path, or expired Session row |
| Phone dev: no JS, TitleCover only | Open via LAN IP without `allowedDevOrigins` — restart `npm run dev`, use `http://192.168.x.x:3000` |
| `dygdyg:3000` unreachable | Add `192.168.x.x dygdyg` to hosts; dev must bind `0.0.0.0` (`npm run dev`) |

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
- `UserWatchProgress` — unique (userId, shikimoriId)
- `KodikEpisodeRelease` — home feed source

## When Adding Features

1. Find similar implementation first (see CONVENTIONS.md)
2. Server data in `src/lib/`, API in `src/app/api/`
3. Client UI in `src/components/`
4. Don't expand middleware — auth via `getSession()` in routes; middleware only for legacy `?shikimori_id=` redirect
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
- Cursor: follow `.cursorrules`, then this file, then task-specific docs/code.
- Multi-topic requests: use the request routing table above. Cursor helpers under `.cursor/` are optional and may be absent.
- Decisions log: `DECISIONS.md` if present.
- Ignore for indexing: `.cursorignore` / tool-specific excludes for `.next/`, `node_modules/`, caches.

## Extended Docs

- `docs/kodik-api/` — Kodik API reference
- `docs/shikimori-api/` — Shikimori API reference
- `docs/KodikSyncDocumentation.md` — sync details
- `docs/SERVER.md` — production setup
