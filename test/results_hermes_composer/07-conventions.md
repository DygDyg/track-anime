# Раздел 7 — Конвенции

## 7.1
Именование файлов:
- **lib / hooks / utils:** `kebab-case` — `anime-page.ts`, `watch-history.ts`, `use-watch-party` → фактически `useWatchParty.ts` (hooks часто camelCase в этом репо).
- **React components:** `PascalCase` — `AnimeWatchPanel.tsx`, `ReleaseFeed.tsx`.
- **App Router:** `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`.
- **Scripts:** `kebab-case` + `.ts`/`.mjs` — `kodik-sync-recent.ts`, `watch-party-server.mjs`.

См. `CONVENTIONS.md` naming section.

## 7.2
Импорты:
- Path alias **`@/*` → `src/*`** — `tsconfig.json` paths.
- Примеры: `import { prisma } from "@/lib/prisma"`, `import { getSession } from "@/lib/auth/session"`.
- Server-only modules: `import "server-only"` (напр. `src/lib/search.ts:1`).
- Relative imports внутри близких папок допустимы, но `@/` — норма.

## 7.3
API routes (App Router):
- Файл: `src/app/api/<path>/route.ts`.
- Export HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, …
- Часто `export const dynamic = "force-dynamic"` для user/admin.
- Auth: `getSession()` / `requireAdminApi()` → `NextResponse.json({ error: "…" }, { status })`.
- User-facing errors на **русском**.
- Пример: `src/app/api/search/route.ts`, `src/app/api/user/watch-history/[shikimoriId]/route.ts`.

## 7.4
Server vs client:
- **Default:** Server Components (`page.tsx` без `"use client"`) — data load, `getSession`, RSC.
- **Client:** `"use client"` в interactive UI (`AnimeWatchPanel`, `KodikPlayer`, `ReleaseFeed`).
- **Server libs:** `import "server-only"` + no browser imports of secrets.
- `"use server"` actions — точечно; основной API pattern — route handlers.

## 7.5
5 ключевых правил из `CONVENTIONS.md` (и связанных AGENTS):
1. Naming: lib kebab-case, components PascalCase, routes `route.ts`/`page.tsx`.
2. Imports через alias `@/`.
3. Разделение server/client; внешние API только с сервера.
4. Auth patterns: `getSession` / `requireAdminApi`; RU error strings.
5. **Documentation impact check** при code change — обновлять только затронутые docs (`CODEBASE_MAP`, `BUSINESS_LOGIC`, …), не «всё подряд».
6. (бонус) Prisma generate / schema discipline; не коммитить секреты.
