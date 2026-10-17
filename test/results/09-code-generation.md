# Раздел 9 — Генерация кода

Код ниже — **предложения для теста**, не применённые в репозиторий. Стиль выровнен с существующими route/lib/component паттернами.

---

## 9.1. API route `src/app/api/user/bookmarks/route.ts`

Использует уже существующую модель `UserAnimeBookmark` (Shikimori favourites cache).

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const bookmarks = await prisma.userAnimeBookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      shikimoriId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ bookmarks });
}
```

---

## 9.2. `getAnimeByGenre` в стиле `src/lib/`

В проекте уже есть `searchAnimesByGenre` (`search.ts` ~1037). Ниже — тонкая серверная обёртка с `server-only` и лимитом, как типичный lib helper:

```typescript
import "server-only";

import { searchAnimesByGenre } from "@/lib/search";
import type { SearchResult } from "@/lib/search-shared";

/**
 * Returns up to `limit` anime materials matching a Kodik genre key/name.
 */
export async function getAnimeByGenre(
  genre: string,
  limit: number,
): Promise<SearchResult[]> {
  const trimmed = genre.trim();
  if (!trimmed) return [];

  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 48) : 24;

  const page = await searchAnimesByGenre(trimmed, 1, safeLimit, {
    includeTotal: false,
    sort: "date",
  });

  return page.items;
}
```

Файл-кандидат: `src/lib/anime-by-genre.ts`.

---

## 9.3. React-компонент `GenreBadge`

Стиль как у `TranslationBadge.tsx` + ссылка в поиск (`/search?genre=`).

```tsx
import Link from "next/link";

type Props = {
  genre: string;
  className?: string;
};

export function GenreBadge({ genre, className = "" }: Props) {
  const name = genre.trim();
  if (!name) return null;

  const href = `/search?genre=${encodeURIComponent(name)}`;

  return (
    <Link
      href={href}
      className={`inline-flex max-w-full items-center truncate rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs font-medium text-inherit transition hover:bg-white/10 ${className}`.trim()}
      title={`Искать жанр «${name}»`}
    >
      {name}
    </Link>
  );
}
```

Файл-кандидат: `src/components/GenreBadge.tsx`.

---

## 9.4. Rate limiter для API routes

Совместим с in-process pattern как `search-protection.ts` (без внешней Redis). Для нескольких инстансов Node нужен shared store — здесь process-local.

```typescript
import "server-only";

import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests per window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
  /** Key prefix, e.g. "search" */
  name: string;
};

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const mapKey = `${options.name}:${key}`;
  let bucket = buckets.get(mapKey);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + options.windowMs };
    buckets.set(mapKey, bucket);
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Слишком много запросов. Попробуйте позже." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Example usage in a route:
 *  const ip = getClientIpFromHeaders(request.headers);
 *  const limited = checkRateLimit(ip, { name: "search", limit: 60, windowMs: 60_000 });
 *  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);
 */
```

Файл-кандидат: `src/lib/api-rate-limit.ts`.

---

## 9.5. Prisma model / migration для `UserBookmark`

**Отличие от существующего `UserAnimeBookmark`:** поле `note`, отдельная таблица пользовательских закладок сайта.

Фрагмент schema (стиль как у соседних моделей):

```prisma
/// Пользовательская закладка с заметкой (не Shikimori favourite)
model UserBookmark {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  shikimoriId Int
  note        String?  @db.Text
  createdAt   DateTime @default(now())

  @@unique([userId, shikimoriId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([shikimoriId])
}
```

В `model User` добавить: `bookmarks UserBookmark[]` (имя relation отличное от `animeBookmarks`).

Пример SQL migration (`prisma/migrations/YYYYMMDDHHMMSS_add_user_bookmark/migration.sql`):

```sql
-- CreateTable
CREATE TABLE "UserBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shikimoriId" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBookmark_userId_createdAt_idx" ON "UserBookmark"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserBookmark_shikimoriId_idx" ON "UserBookmark"("shikimoriId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBookmark_userId_shikimoriId_key" ON "UserBookmark"("userId", "shikimoriId");

-- AddForeignKey
ALTER TABLE "UserBookmark" ADD CONSTRAINT "UserBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
