## 7.1
Именование файлов:
- lib modules — `kebab-case`, пример `anime-page.ts`, `kodik-sync-settings.ts` — `CONVENTIONS.md:5-8`.
- React components — `PascalCase`, пример `AnimeWatchPanel.tsx` — `CONVENTIONS.md:8`.
- API routes — `route.ts` внутри folder route — `CONVENTIONS.md:10`.
- Pages — `page.tsx` — `CONVENTIONS.md:11`.

## 7.2
Импорты:
- Используется path alias `@/* -> src/*` — `CONVENTIONS.md:19-31`.
- Примеры: `import { prisma } from "@/lib/prisma";`, `import { getSession } from "@/lib/auth/session";` — `CONVENTIONS.md:21-28`.
- Для server-only модулей есть `import "server-only"` — `CONVENTIONS.md:26-28`, реальный пример `src/lib/search.ts:1`.

## 7.3
Паттерн API routes:
- App Router route handlers в `src/app/api/**/route.ts`.
- Auth check обычно через `getSession()` и возврат `NextResponse.json({ error }, { status })` — `CONVENTIONS.md:67-79`.
- Пример реального route: `src/app/api/search/route.ts:13-53`, `src/app/api/user/watch-history/[shikimoriId]/route.ts:17-114`.

## 7.4
Разделение server/client:
- Server components по умолчанию: `page.tsx` делает data loading и `getSession()` — `CONVENTIONS.md:35-40`.
- Client components имеют `"use client"` и отвечают за interactivity — `CONVENTIONS.md:37-39`.
- Примеры:
  - client: `src/components/anime/AnimeWatchPanel.tsx:1`, `src/components/anime/KodikPlayer.tsx:1`.
  - server utility: `src/lib/search.ts:1` (`server-only`).

## 7.5
5 ключевых правил из `CONVENTIONS.md`:
1. Держать lib modules в `kebab-case`, components в `PascalCase` — `3-12`.
2. Использовать alias `@/` для импортов из `src` — `19-31`.
3. Server/client разделять по паттерну App Router + `"use client"` — `33-40`.
4. Для auth в API routes использовать `getSession()` / `requireAdminApi()` — `67-88`.
5. При каждом code change делать documentation impact check и обновлять только затронутые секции — `128-146`.
