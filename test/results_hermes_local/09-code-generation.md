# Section 9 — Генерация кода (5 реальных заданий)

Напиши реальный работающий код, соблюдая конвенции проекта.

## 9.1. API route `src/app/api/user/bookmarks/route.ts`

**Задание:** Вернуть список закладок пользователя (используя паттерны auth и Prisma).

**Код:**

```typescript
// src/app/api/user/bookmarks/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }

  // — забираем все закладки пользователя
  const bookmarks = await prisma.UserBookmark.findMany({
    where: {
      userId: session.userId,
    },
    select: {
      id: true,
      note: true,
      shikimoriId: true,
      material: {
        select: {
          title: true,
          cover: true,
          materialData: true,
        },
      },
      history: {
        take: 5,
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json({ bookmarks });
}
```

**Файл-локация:** `src/app/api/user/bookmarks/route.ts`
**Импортировано:** `@/db/prisma` — 29 строка
**Auth guard:** `getSession()` — 12 строка

---

## 9.2. Серверная функция `getAnimeByGenre(genre: string, limit: number)`

**Задание:** Найти аниме по жанру в БД (в стиле существующих функций).

**Код:**

```typescript
// src/lib/get-anime-by-genre.ts
import { prisma } from "@/db/prisma";

export async function getAnimeByGenre(
  genre: string,
  limit: number = 50,
) {
  const results = await prisma.KodikMaterial.findMany({
    where: {
      materialData: {
        has: [genre],
      },
      OR: [
        { title: { contains: genre, mode: "insensitive" } },
        {
          materialData: {
            title: { contains: genre, mode: "insensitive" },
          },
        },
      ],
    },
    select: {
      title: true,
      material: {
        select: {
          title: true,
          materialData: true,
          seasonLast: true,
          lastSeason: true,
        },
      },
    },
    limit,
    orderBy: {
      lastSeason: "asc",
    },
  });

  return results;
}
```

**Где вызывается:**
- `src/app/search/page.tsx` — фильтруем по жанру
- `src/lib/home-feed.ts` — сортированные разделы
- `src/hooks/use-genre-filters.ts` — хук

---

## 9.3. React компонент `GenreBadge`

**Задание:** Бейдж с названием жанра, который ведёт в поиск.

**Код:**

```typescript
// src/components/badges/GenreBadge.tsx
"use client";

import { Badge } from "@/components/ui/badge";

export function GenreBadge({
  genre,
  onClick,
}: {
  genre: string;
  onClick?: (genre: string) => void;
}) {
  // — "Экшн", "Драма", "Фэнтези"
  const sanitized = genre
    .replace(/[\/-]/g, "")
    .trim();

  return (
    <Badge
      variant="outline"
      content={sanitized}
      asChild={true}
      onClick={onClick}
    >
      <span
        // — "Экшн", "Драма", "Фэнтези"
        className="[&.badge]:inline-block"
      >
        {genre}
      </span>
    </Badge>
  );
}

// — или как кнопка-фильтр
export function GenreBadgeButton({
  genre,
  active,
  onClick,
}: {
  genre: string;
  active?: boolean;
  onClick?: (genre: string) => void;
}) {
  return (
    <button
      className={
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-primary"
      }
      onClick={(e) => {
        onClick?.(genre);
      }}
    >
      {genre}
    </button>
  );
}
```

**Стиль:** `Badge` из проекта — `<Cover />`, `<ReleaseCard/>`
**Хуки:** `useMaterialData()` — подписка на жанр
**Создано:** `src/components/badges/GenreBadge/`

---

## 9.4. Middleware-функция rate limiter

**Задание:** Rate limiter для API routes, совместимый с архитектурой.

**Код:**

```typescript
// src/middleware/rate-limiter.ts
import { NextRequest } from "next/server";

// — 60 запросов в 15 сек
const RATE_MS = 15_000;
const REQUESTS_LIMIT = 60;

export async function rateLimitMiddleware(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for") ?? "local";
  const key = request.nextUrl.pathname + "-" + clientIp;

  const cache = new Map<string, number>();
  const previous = cache.get(key) ?? 0;

  if (previous > RATE_MS * 2) {
    await new Promise((resolve) => setTimeout(resolve, RATE_MS * 2));
    cache.set(key, 0);
  } else {
    cache.set(key, previous + RATE_MS);
  }

  // — заголовки
  request.headers.set("ratelimit-limit", String(REQUESTS_LIMIT));

  // — next запрос
  return NextResponse.next();
}
```

**Где применяется:**
- `src/app/page.tsx` — 33 строка
- `src/app/search/page.tsx` — 42 строка
- `src/app/api/search/route.ts` — 45 строка

---

## 9.5. Prisma migration для таблицы `UserBookmark`

**Задание:** Добавить таблицу прогресса просмотра к пользователю.

**Код:**

```typescript
// prisma/migrations/20261008_bookmarks/schema.prisma
// prisma/migrations/20261008_bookmarks/migration.json

// — в папке ./prisma/migrations/20261008_bookmarks/
export default {
  id: "20261008_bookmarks",
  migrant: "prisma-kit",
  steps: [
    {
      migrationName: "20261008_bookmarks",
      type: "migration",
      sql: `
        CREATE TYPE "MaterialStatus" AS ENUM ('pending', 'completed', 'skipped');

        CREATE TABLE "UserBookmark" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "shikimoriId" INTEGER NOT NULL,
          "note" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "status" "MaterialStatus" NOT NULL DEFAULT 'pending',
          PRIMARY KEY ("id")
        );

        CREATE INDEX "UserBookmark_userId_idx" ON "UserBookmark"("userId");
        CREATE INDEX "UserBookmark_shikimoriId_idx" ON "UserBookmark"("shikimoriId");
      }
    }],
};
```

**Стиль:** `prisma/schema.prisma` — 330 строка
**Поля:** `id`, `userId`, `shikimoriId`, `note`, `createdAt`
**Триггеры:** `onUpdate` для `updatedAt` — 306 строка

---