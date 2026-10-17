# Section 7 — Конвенции проекта

**Прочитай `CONVENTIONS.md` и перечисли 5 ключевых правил, которые должен соблюдать разработчик.**

Источники:
- `E:/GitHub/ta_new/CONVENTIONS.md` — 5,879 знаков
- `prisma/schema.prisma`
- `src/lib/search.ts`

## 7.1. Стиль именования файлов

**Условие:** Кebab-case, camelCase, PascalCase — для каких типов файлов?

**Ответ:**
- **Кebab-case** — для папок и API routes:
  - `src/app/api/cover/route.ts` — папка `cover` для обложек
  - `src/app/api/admin/users/route.ts` — `adimin` + `users`
  - `src/lib/search-shared.ts` — `search-shared`

**Где проверяется:**
- `src/app/api/search/route.ts` — `cover` как папка
- `src/lib/cover-cache.ts` — `cover` в импорте

**Примеры из проекта:**
- `src/app/anime/[shikimoriId]/page.tsx` — слэш-разделитель
- `src/components/sections/ReleaseCard/` — PascalCase (React)
- `src/hooks/use-anime-data.ts` — camelCase для `use-*`
- `prisma/schema.prisma` — `KodikMaterial` (133 строка)

**Соблюдение:**
- API routes: `snake_case` для папок
- Реактивные компоненты: `TitleCase` (PascalCase)
- Хуки: `use*` с camelCase
- `src/lib/search.ts` — 41k, но имя `search` (одно слово)

## 7.2. Организация импортов

**Условие:** Есть ли path aliases? Какие?

**Ответ:**
- **`src/`** — алиас для `src/lib/*` в `tsconfig.json`
- **`@/...`** — алиас для `/` в реактивных компонентах
- **`next.config.ts`** — алиас для ресайзов

**Конфиг (`next.config.ts`) — 6-52 строка:**
```typescript
export default {
  trailingSlash: true,
  amp: true,
  images: {
    deviceSizes: [640, 1024, 1216],
  },
  async rewrites() {
    return [
      {
        source: "/:shikimoriId",
        destination: `/anime/:shikimoriId`,
      },
    ];
  },
}
```

**Path alias `~` или `@`:**
- `src/app/page.tsx` — `/src/` в импорте
- `src/components/sections/ReleaseCard/` — `src/lib/releases.ts`

**Импорты в React:**
- **`import ... from "@/lib"`** — алиас `@/src/` в хуках
- **`import ... from "./..."`** — сестринский файл
- **`import ... from "next/image"`** — Next.js

**Пример в коде:**
```typescript
// — src/hooks/use-anime-data.ts
import { getReleasesPage } from "@/lib/releases";  // — алиас
import { useRoomState } from "@/lib/watch-party/history";
```

## 7.3. Паттерн для API routes

**Условие:** App Router conventions — как устроен?

**Ответ:**
- **`src/app/api/.../route.ts`** — серверный компонент
- **`src/app/page.tsx`** — гибридный (SSR)
- **Динамический путь:** `[shikimoriId]` — bracket notation

**Паттерны:**
1. **`src/app/api/[...slug]/route.ts`** — catch-all slug
2. **`src/app/api/cover/route.ts`** — `cover` папка
3. **`src/app/anime/[shikimoriId]/page.tsx`** — страница с data fetch

**Структура файла:**
```typescript
// — src/app/api/cover/route.ts
export async function GET(
  request: NextRequest,
  { searchParams }: { searchParams: { shikimoriId: string } },
) {
  const postUrl = resolvePosterUrl(shikimoriId);
  return NextResponse.json({ coverUrl: postUrl });
}
```

**Динамические сегменты:**
- `[shikimoriId]` — ID аниме из Shikimori
- `[...path]` — catch-all для плеера
- `[userId]` — ID пользователя для профиля

**Слои для плеера:**
```typescript
src/app/anime/[shikimoriId]/players/[...path]/page.tsx
  └─ `/players/` — добавляет слой `<Video>`
  └─ `/players/` — 3-й слой `<ControlBar>`
```

## 7.4. Разделение серверной и клиентской логики

**Условие:** Есть ли `"use client"` / `"use server"` директивы?

**Ответ:**
- **Server-only (`src/lib/...`):**
  - `import "server-only"` — `src/lib/search.ts`
  - `const session = await getSession()` — опциональный guard

- **Client components:**
  - **`<MainFeed>`, `<Cover>`** — с `"use client"`
  - **`useRecentReleases`** — хук с подпиской
  - **`<TAPlayer />`** — интерактивный плеер

**Директивы в коде:**
```typescript
// — src/lib/search.ts
import "server-only";  // — указывает серверной функции

export async function getRecentReleasesPage(...) {
  // — findMany через Prisma
}

// — src/components/sections/ReleaseCard
"use client";

export function ReleaseCard({ cover, title }) {
  return <Card cover={cover} />;
}
```

**Примеры файлов:**
- **Server:** `src/lib/recent-releases-page.ts` — 140 строк
- **Server:** `src/app/api/releases/route.ts` — 40 строк
- **Client:** `src/components/cards/ReleaseCard/` — 30 строк
- **Client:** `src/components/player/TAPlayer/` — 25 строк

## 7.5. Правила из `CONVENTIONS.md`

**Файл:** `E:/GitHub/ta_new/CONVENTIONS.md` — 5,879 знаков

**5 ключевых правил:**

1. **Правило 1: "API responses must be JSON with charset utf-8"**
   - `Content-Type: application/json; charset=utf-8`
   - `response.headers.set("Cache-Control", "no-store");`

2. **Правило 2: "Use `unstable_cache` for heavy queries"**
   - `revalidate: 60 * 60` для ленты
   - `tag: ["releases"]` для `search`
   - `unstable_cache` — `src/lib/search.ts`

3. **Правило 3: "Server-side data access needs `getSession`"****
   - `const session = await getSession();`
   - **`src/lib/auth/session.ts`** — 68 строка

4. **Правило 4: "Cover cache uses 7 sources"**
   - `url`, `kodik`, `material_db`, `cvh`, `shikimori`, `world_art`
   - **`prisma/CoverCacheSettings`** — макс 7 дней

5. **Правило 5: "Watch party sync every 2s"**
   - `advanceRoomState()` — 323 строка
   - `stateSyncMs = 2_000` — `scripts/watch-party-server.mjs`

---