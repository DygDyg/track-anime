# Раздел 7 — Конвенции проекта

## 7.1. Именование файлов

| Тип | Стиль | Пример |
|-----|-------|--------|
| Lib modules | kebab-case | `anime-page.ts`, `kodik-sync.ts` |
| React components | PascalCase | `AnimeWatchPanel.tsx` |
| Co-located styles | `*-styles.ts`, `*-theme.ts` | `header-styles.ts` |
| API routes | `route.ts` в папке | `api/releases/route.ts` |
| Pages | `page.tsx` | `anime/[shikimoriId]/page.tsx` |

Источник: `CONVENTIONS.md` § File Naming.

## 7.2. Импорты и aliases

- Path alias: `@/*` → `src/*` (`tsconfig.json`)
- Пример: `import { prisma } from "@/lib/prisma"`
- Server-only: `import "server-only"` в модулях вроде `search.ts`
- CLI может импортировать compiled `.js` variants

## 7.3. Паттерн API routes

App Router: `src/app/api/**/route.ts` с named exports `GET`/`POST`/`PUT`/`DELETE`.

Типичный шаблон (`CONVENTIONS.md`):
1. `getSession()` / `requireAdminApi()`
2. parse params/body
3. `NextResponse.json({ … }, { status })`
4. Часто `export const dynamic = "force-dynamic"` для user data

## 7.4. Server vs Client components

| | |
|--|--|
| Default | Server Component (`page.tsx` — data fetch) |
| Client | `"use client"` — hooks, player, infinite scroll, settings |
| `"use server"` | встречается редко; основной server boundary — Server Components + route handlers + `server-only` modules |

Данные: Server page → DTO props → client view; мутации — `fetch("/api/...")`.

## 7.5. Пять ключевых правил из `CONVENTIONS.md`

1. Искать похожий код перед новым решением; минимальные изменения
2. Auth: `getSession()` / `requireAdmin()` / `requireAdminApi()` на каждом protected route
3. DTO suffix (`ReleaseItemDto`, `AnimePageDto`); Prisma singleton в `src/lib/prisma.ts`
4. UI strings на русском; Tailwind + CSS variables; dark default
5. Documentation impact check при любом изменении поведения/архитектуры (таблица doc targets)
