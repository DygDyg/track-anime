## 9.1
Эталонный route `src/app/api/user/bookmarks/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const items = await prisma.userAnimeBookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      shikimoriId: true,
      label: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      shikimoriId: item.shikimoriId,
      label: item.label,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
}
```

## 9.2
Эталонная server function:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeKodikGenreKey } from "@/lib/kodik-material-meta";

export type AnimeByGenreItem = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  year: number | null;
  translationTitle: string;
};

export async function getAnimeByGenre(
  genre: string,
  limit: number,
): Promise<AnimeByGenreItem[]> {
  const genreKey = normalizeKodikGenreKey(genre);
  if (!genreKey) return [];

  const rows = await prisma.kodikMaterial.findMany({
    where: {
      shikimoriId: { not: null },
      genres: {
        some: { genreKey },
      },
    },
    orderBy: [{ kodikUpdatedAt: "desc" }, { updatedAt: "desc" }],
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      shikimoriId: true,
      title: true,
      titleOrig: true,
      year: true,
      translationTitle: true,
    },
  });

  return rows.map((row) => ({
    shikimoriId: row.shikimoriId!,
    title: row.title,
    titleOriginal: row.titleOrig,
    year: row.year,
    translationTitle: row.translationTitle,
  }));
}
```

## 9.3
Эталонный React component `GenreBadge`:

```tsx
import Link from "next/link";
import { buildSearchHref } from "@/lib/search-shared";

type Props = {
  name: string;
};

export function GenreBadge({ name }: Props) {
  const href = buildSearchHref({ genre: name });

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
    >
      {name}
    </Link>
  );
}
```

## 9.4
Эталонный rate limiter middleware/helper для API routes:

```ts
import "server-only";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkApiRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { ok: true };
  }

  if (current.count >= options.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { ok: true };
}
```

Пример использования в route:

```ts
const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
const result = checkApiRateLimit(`search:${forwardedFor}`, { limit: 30, windowMs: 60_000 });
if (!result.ok) {
  return NextResponse.json(
    { error: "Слишком много запросов" },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}
```

## 9.5
Эталонная Prisma schema/migration идея для `UserBookmark`.
Важно: в проекте уже есть `UserAnimeBookmark` (`prisma/schema.prisma:439`), так что создание второй почти дублирующей таблицы было бы спорным решением.

Если следовать запросу буквально, schema могла бы быть такой:

```prisma
model UserBookmark {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  shikimoriId Int
  note        String?  @db.Text
  createdAt   DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([shikimoriId])
  @@unique([userId, shikimoriId])
}
```

Пример SQL migration:

```sql
CREATE TABLE "UserBookmark" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shikimoriId" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBookmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBookmark_userId_shikimoriId_key"
  ON "UserBookmark"("userId", "shikimoriId");

CREATE INDEX "UserBookmark_userId_createdAt_idx"
  ON "UserBookmark"("userId", "createdAt" DESC);

CREATE INDEX "UserBookmark_shikimoriId_idx"
  ON "UserBookmark"("shikimoriId");

ALTER TABLE "UserBookmark"
  ADD CONSTRAINT "UserBookmark_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```
