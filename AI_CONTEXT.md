# Track Anime — AI Context

Quick reference for AI assistants working on this codebase.

## What This Project Is

Next.js anime streaming site with Shikimori OAuth + Kodik player. Data lives in PostgreSQL. External APIs called only from server.

## Critical Paths

| Task | Start here |
|------|------------|
| Fix auth/login | `src/lib/auth/shikimori-oauth.ts`, `src/app/api/auth/callback/shikimori/route.ts` |
| Fix player | `src/components/anime/KodikPlayer.tsx`, `src/lib/kodik-player-api.ts` |
| Fix home feed | `src/lib/releases.ts`, `src/components/ReleaseFeed.tsx` |
| Fix anime page | `src/lib/anime-page.ts`, `src/app/anime/[shikimoriId]/page.tsx` |
| Fix lists/favorites | `src/lib/favorites-sync.ts`, `src/lib/shikimori/user-list-mutations.ts` |
| Fix search | `src/lib/search.ts` (server-only, raw SQL) |
| Fix import/sync | `src/lib/admin/kodik-sync.ts`, `scripts/kodik-import-full.ts` |
| Fix posters | `src/lib/poster-fallback.ts`, `src/lib/cover-cache.ts`, `/api/cover` |
| Fix admin | `src/lib/auth/admin.ts`, `src/app/admin/` |

## Hidden Assumptions

1. **No middleware.ts** — auth is per-route, not global
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
4. Don't add middleware — use `getSession()` in route
5. Don't call external APIs from client components
6. Update only affected doc sections if behavior changes

## Extended Docs

- `docs/kodik-api/` — Kodik API reference
- `docs/shikimori-api/` — Shikimori API reference
- `docs/KodikSyncDocumentation.md` — sync details
- `docs/SERVER.md` — production setup
