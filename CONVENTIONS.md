# Track Anime — Conventions

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Lib modules | kebab-case | `anime-page.ts`, `kodik-sync-settings.ts` |
| React components | PascalCase | `AnimeWatchPanel.tsx`, `ReleaseCard.tsx` |
| Co-located styles | `*-styles.ts`, `*-theme.ts` | `header-styles.ts`, `favorites-tab-theme.ts` |
| API routes | `route.ts` in folder | `src/app/api/releases/route.ts` |
| Pages | `page.tsx` | `src/app/anime/[shikimoriId]/page.tsx` |

## Folder Organization

- **By domain:** `lib/auth/`, `lib/shikimori/`, `lib/admin/`, `components/anime/`
- **App Router co-location:** pages and API routes under `src/app/`
- **External API clients:** `src/kodik/` (Kodik), `src/lib/shikimori/` (Shikimori)

## Imports

```typescript
// Path alias
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

// Server-only modules
import "server-only";  // in search.ts and similar
```

- Alias `@/*` → `src/*` (tsconfig paths)
- CLI scripts may import compiled `.js` variants (`kodik-import.js`) for tsx execution

## Server vs Client Components

| Pattern | Usage |
|---------|-------|
| Server Component (default) | `page.tsx` — data fetching, `getSession()`, lib loaders |
| Client Component | `"use client"` — interactivity, hooks, fetch mutations, player |
| Data passing | Server page → DTO props → client view |

**~50 client components:** auth, player, feed scroll, settings modal, admin panels.

## TypeScript Patterns

### DTO suffix

```typescript
type ReleaseItemDto = { ... };
type AnimePageDto = { ... };
type WatchProgressDto = { ... };
```

### Prisma singleton

```typescript
// src/lib/prisma.ts — global reuse in dev
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ ... });
```

### React cache

```typescript
import { cache } from "react";
export const getAnimePageData = cache(async (shikimoriId: number) => { ... });
```

## API Route Patterns

```typescript
// Auth check
const session = await getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Admin check
await requireAdminApi();

// Standard response
return NextResponse.json({ data });
```

## Auth Patterns

| Guard | Usage |
|-------|-------|
| `getSession()` | Optional auth — returns `AuthSession \| null` |
| `requireAdmin()` | Admin pages — redirects if not admin |
| `requireAdminApi()` | Admin API — returns 403 |

Session cookie name from `authConfig.sessionCookie` (typically `ta.session`).

## Architectural Patterns

### Local-first sync (Shikimori lists)

1. Write to local DB
2. Respond to user immediately
3. Push to Shikimori API (or pull on sync)

### Poster fallback chain

Multiple sources tried in order — see `poster-fallback.ts`.

### Rate limiting

Separate limiters for Shikimori (`lib/shikimori/rate-limiter.ts`) and Kodik (`kodik/rate-limiter.ts`).

### Job state in DB

Long-running operations (import, sync) track state in Prisma models (`KodikImportJob`, `KodikSyncRun`).

## UI Conventions

- **Language:** Russian UI strings inline in components
- **Theme:** dark default (`data-theme="dark"`), light/dark toggle
- **Styling:** Tailwind utility classes, CSS variables for theme colors
- **Layout:** responsive breakpoints (`sm:`, `lg:`), mobile-first

## Build Conventions

```json
"build": "node scripts/sync-brand-assets.mjs && next build && node scripts/write-build-info.mjs"
"watch-party:server": "node scripts/watch-party-server.mjs"
```

- `postinstall`: `prisma generate`
- Brand assets versioned via hash in `site-brand.generated.ts`

## Documentation Conventions

Every code change must include a documentation impact check.

Update docs in the same task when behavior, architecture, public API, operations, or project workflow changes. Keep updates scoped to affected sections.

| Change type | Documentation target |
|-------------|----------------------|
| New/changed page, API route, module, script, Prisma model | `CODEBASE_MAP.md`, relevant feature docs |
| Architecture, data flow, auth/session/import/sync pipeline | `ARCHITECTURE.md` |
| Business rule, user flow, edge case, invariant | `BUSINESS_LOGIC.md`, `AI_CONTEXT.md` |
| Naming, file layout, local patterns | `CONVENTIONS.md` |
| Env var, npm script, setup, deploy behavior | `.env.example`, `README.md`, `docs/SERVER.md`, `docs/DEPLOY.md` |
| External API parameter/scope/rate-limit usage | `docs/kodik-api/`, `docs/shikimori-api/` |
| AI instructions or critical paths | `AGENTS.md`, `.cursorrules`, `AI_RULES.md`, `AI_CONTEXT.md` |

Do not rewrite full documentation files unless the task is explicitly a documentation rewrite. Prefer small factual diffs.

If a code change does not affect documentation, mention `Docs: not needed` in the final response.

## Git / Deploy

- Deploy scripts: `scripts/deploy.ps1` (Windows pack), `scripts/server-deploy.sh` (server)
- Env: `.env.example` as template, never commit `.env`

## Testing

No formal test suite in repo. Debug scripts in `scripts/debug-*.mjs` for manual investigation.
