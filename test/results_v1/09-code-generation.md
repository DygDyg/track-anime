# Раздел 9 — Генерация кода

## 9.1. Напиши API route `src/app/api/user/bookmarks/route.ts`, который возвращает список закладок пользователя (используя существующие паттерны auth и Prisma).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bookmarks = await prisma.userBookmark.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        shikimoriId: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(bookmarks);
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

## 9.2. Напиши серверную функцию `getAnimeByGenre(genre: string, limit: number)` в стиле существующих функций в `src/lib/`, которая ищет аниме по жанру в БД.

```typescript
import { prisma } from "@/lib/prisma";

export async function getAnimeByGenre(genre: string, limit: number = 20) {
  try {
    const anime = await prisma.kodikMaterial.findMany({
      where: {
        genres: {
          contains: genre,
        },
      },
      select: {
        id: true,
        title: true,
        shikimori_id: true,
        poster: true,
        year: true,
        type: true,
      },
      take: limit,
      orderBy: { 
        title: "asc" 
      }
    });

    return anime;
  } catch (error) {
    console.error("Error fetching anime by genre:", error);
    throw new Error("Failed to fetch anime");
  }
}
```

## 9.3. Напиши React компонент `GenreBadge` в стиле существующих компонентов проекта — бейдж с названием жанра, который ведёт в поиск.

```typescript
import Link from "next/link";

interface GenreBadgeProps {
  genre: string;
}

export function GenreBadge({ genre }: GenreBadgeProps) {
  return (
    <Link 
      href={`/search?query=${encodeURIComponent(genre)}`}
      className="inline-block px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
    >
      {genre}
    </Link>
  );
}
```

## 9.4. Напиши middleware-функцию rate limiter для API routes, совместимую с существующей архитектурой.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

const RATE_LIMIT = 100; // requests per minute
const REQUESTS_PER_MINUTE = 60;

export function rateLimiter() {
  const requestCounts: Record<string, number> = {};
  
  return async function (request: NextRequest) {
    const ip = request.ip ?? "127.0.0.1";
    const now = Math.floor(Date.now() / 1000);
    
    if (!requestCounts[ip]) {
      requestCounts[ip] = 0;
    }
    
    if (requestCounts[ip] >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
    
    requestCounts[ip]++;
    
    // Reset count every minute
    setTimeout(() => {
      requestCounts[ip] = 0;
    }, REQUESTS_PER_MINUTE * 1000);
    
    return undefined;
  };
}
```

## 9.5. Напиши Prisma migration для добавления таблицы `UserBookmark` с полями: `id`, `userId`, `shikimoriId`, `note`, `createdAt`. Используй стиль существующей schema.

```prisma
/// Пользовательские закладки
model UserBookmark {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  shikimoriId  Int
  note         String?
  createdAt    DateTime @default(now())
}
```