# Раздел 9 — Генерация кода

Код ниже — **предложения в стиле проекта**, не применённые в tree (кроме как в этом файле).  
Учтено: `@/lib/prisma`, `getSession`, RU errors, `server-only`, существующая модель **`UserAnimeBookmark`** (без `label`/`note` в текущей schema).

## 9.1
`src/app/api/user/bookmarks/route.ts` (читает существующие bookmarks):

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
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      shikimoriId: item.shikimoriId,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
```

Примечание: модель `UserAnimeBookmark` — `prisma/schema.prisma:574-583` (`id`, `userId`, `shikimoriId`, `createdAt`, `@@unique([userId, shikimoriId])`).

## 9.2
Серверная функция в стиле `src/lib/`:

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

  const take = Math.max(1, Math.min(limit, 100));

  const rows = await prisma.kodikMaterial.findMany({
    where: {
      shikimoriId: { not: null },
      genres: {
        some: { genreKey },
      },
    },
    orderBy: [{ kodikUpdatedAt: "desc" }, { updatedAt: "desc" }],
    take,
    select: {
      shikimoriId: true,
      title: true,
      titleOrig: true,
      year: true,
      translationTitle: true,
    },
  });

  // Один shikimoriId может дать несколько materials — дедуп по id
  const seen = new Set<number>();
  const out: AnimeByGenreItem[] = [];
  for (const row of rows) {
    const id = row.shikimoriId!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      shikimoriId: id,
      title: row.title,
      titleOriginal: row.titleOrig,
      year: row.year,
      translationTitle: row.translationTitle,
    });
  }
  return out;
}
```

Альтернатива уже в проекте: `searchAnimesByGenre` — `src/lib/search.ts:1037+` (full search pipeline).

## 9.3
React `GenreBadge`:

```tsx
import Link from "next/link";
import { buildSearchHref } from "@/lib/search-shared";

type Props = {
  name: string;
  className?: string;
};

export function GenreBadge({ name, className }: Props) {
  const href = buildSearchHref({ genre: name });

  return (
    <Link
      href={href}
      className={
        className ??
        "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
      }
    >
      {name}
    </Link>
  );
}
```

## 9.4
Rate limiter helper (module-level Map, совместим с route handlers; multi-instance note: in-memory per process):

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
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
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

Использование в `api/search/route.ts`:

```ts
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const limited = checkApiRateLimit(`search:${ip}`, { limit: 30, windowMs: 60_000 });
if (!limited.ok) {
  return NextResponse.json(
    { error: "Слишком много запросов" },
    { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
  );
}
```

Дополняет (не заменяет) `withPublicSearchSlot`.

## 9.5
**Важно:** в schema уже есть `UserAnimeBookmark` (~574). Новая `UserBookmark` с `note` — **дублирование домена**; лучше расширить существующую модель полем `note String?`.

Если следовать заданию буквально:

```prisma
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

SQL migration sketch:

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

Предпочтительный вариант вместо новой таблицы:

```prisma
// на UserAnimeBookmark
note String? @db.Text
```
