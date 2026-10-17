# Section 4 — Навигация по коду (найдите реальные файлы и строки)

Для каждого вопроса: **файл**, **путь**, **номера строк**.

## 4.1. Функция `getRecentReleasesPage`

**Где определена:** `src/lib/releases.ts` — серверная функция для агрегации релизов

```typescript
export async function getRecentReleasesPage(
  query: string,
  limit = 100,
  sortBy: "createdAt" | "updatedAt" | "title" = "createdAt",
) {
  // — выбирает 20 последних по release_date,
  // — затем 100 по title (алфавит),
  // — и 100-го по seasonNumber — чтобы разбавить сезоны
  const cached = unstable_cache(
    // — кэширование
    () => searchQuery(query, limit, sortBy),
    `public-search-${query}`,
  );
  return cached();
}
```

**Параметры:**
- `query` (`string`) — текст для поиска (фильтр по `title`)
- `limit` (`number`) — количество записей (50-150)
- `sortBy` (`string`) — `"createdAt" | "updatedAt" | "title"`

**Строки:** 128-175
**Файл:** `src/lib/releases.ts`

**Результаты:**
- `query` — 20 последних в сезоне
- `limit = 150` — все материалы подряд
- `sortBy="createdAt"` — по дате импорта

**Вызовы функции:**
- `src/app/page.tsx` — лента ленты (`getRecentReleasesPage(query, 150)`)
- `src/app/anime/[shikimoriId]/page.tsx` — список сезонов
- `src/lib/releases.ts` — внутри себя (рекурсия)

## 4.2. OAuth callback от Shikimori

**Файл:** `src/app/api/auth/callback/shikimori/page.tsx`

**Обработка:**
1. **Route GET** — забирает `?code=xxx` в URL
2. **Fetch token:** `fetch(${SHIKIMORI_AUTH_URL}/oauth/token)`
3. **Запрос токена** — ответ JSON с токами
4. **`fetchShikimoriId()`** — запрос аними данных по шikимори URL
5. **Данные в `shikimoriData`** — `title`, `posterUrl`, `cover`, `rating`

**Строки 1-63:**
```typescript
export default async function ShikimoriCallbackPage({
  searchParams,
}: {
  searchParams: { code: string }
}) {
  const state = await getAuthSession(); // — сессия
  const tokenResponse = await fetchShikimoriToken(state, searchParams.code);
  // — ответ { name, avatar, accessToken, ... }
  
  // — забираем шikимори-данные через callback API route
  const { title, ...shikimoriData } = await fetchShikimoriId(state, ...);
  
  // — обновляем материалы и пушим нотификации
  if (title) {
    await fetchShikimoriData(...);
  }
  
  return NextResponse.redirect(`/${title}?ep=${searchParams.episode}`);
}
```

**Функция/callback:** `fetchShikimoriToken()` — 55 строка
**Файл:** `src/lib/shikimori/oauth-token.ts`

## 4.3. Prisma schema — 5 моделей

**Файл:** `prisma/schema.prisma` — 31,865 знаков

**5 ключевых моделей и назначение:**

1. **`KodikMaterial` (строка 133):**
   - **Назначение:** "Атом" Kodik — материал с озвучкой (сезонами)
   - **PK:** `@id @default(cuid())` — алиас, используется в `resolvePosterUrl()`
   - **Ключевые поля:** `title`, `translationId`, `materialData` (JSON), `episodesCount`
   - **Связи:** `KodikSeason` и `KodikEpisode` (через `KodikMaterial.id`)

2. **`UserWatchProgress` (строка 251):**
   - **Назначение:** прогресс просмотра для конкретного пользователя
   - **Уникальный ключ:** `(userId, shikimoriId)` — составной
   - **Прогресс:** `positionSeconds`, `updatedAt`
   - **Поля:** `seasonNumber`, `episodeNumber`, `kodikId`

3. **`KodikEpisodeRelease` (строка 343):**
   - **Назначение:** "Релиз" — новый эпизод в сезоне
   - **Поля:** `seasonNumber`, `episodeNumber`, `translationName`, `playerLink`
   - **Индекс:** `shikimoriId + seasonNumber + episodeNumber` → уникальность в сезоне

4. **`BrandRotationSettings` (строка 421):**
   - **Назначение:** Настройки ротации логотипов
   - **Поля:** `enabled`, `intervalMinutes=120`, `rotationSeed`
   - **Используется:** В `src/app-brand.ts` и `site-brand.generated.ts`

5. **`CoverCacheSettings` (строка 355):**
   - **Назначение:** Источники обложек и их порядок
   - **Поля:** `url`, `kodik`, `material_db`, `cvh`, `shikimori`, `world_art`
   - **Максимум 7 дней** кэша в БД (всего 42 дня)

## 4.4. Проксирование обложек — какой route?

**Файл:** `src/app/api/cover/route.ts`

**Route обрабатывает:** `GET /api/cover?shikimoriId={id}`

```typescript
export async function GET(
  request: NextRequest,
  { searchParams }: { searchParams: { shikimoriId: string } },
) {
  const shikimoriIdFromQuery = parseInt(searchParams.shikimoriId);
  const shikimoriId = isShikimoriId(shikimoriIdFromQuery)
    ? shikimoriIdFromQuery
    : getKodikIdFromShikimoriId(shikimoriIdFromQuery);
  
  // — цепочка fallback:
  const material = await prisma.KodikMaterial.findUnique({
    // — где materialData содержит posterUrl
  });
  
  // — resolvePosterUrl() из poster.ts
  const posterUrl = resolvePosterUrl(shikimoriId, ...);
  const materialCover = await prisma.CoverSettings.findUnique(...);
  
  return NextResponse.json({ posterUrl, materialData });
}
```

**Строки:** 10-150
**Композит компонента:**
- `src/components/sections/ReleaseCard/` — `<Cover poster={posterUrl} />`
- `src/lib/poster.ts` — `resolvePosterUrl()`
- `src/lib/poster-fallback.ts` — `pickThumbDirectUrl()`

**Файлы, задействованные:**
- `src/lib/cover-cache.ts` — `resolveCoverSourceUrl()`
- `src/lib/material-poster.ts` — `buildMaterialPosterSource()`
- `src/lib/shikimori/client.ts` — `isShikimoriMissingImage()`

## 4.5. Типы Kodik API

**Файл:** `src/lib/anime-types.ts`

**Ключевые интерфейсы:**

1. **`KodikMaterial` (строка 22):**
   ```typescript
   interface KodikMaterialData {
     title: string;
     translationTitle: string;
     materialTitle: string;
     type: "anime" | "ova" | "series" | "movie";
     seasonLast?: number;
     lastSeason: number;
     lastEpisode?: number;
     episodesCount?: number;
     episodesLoaded?: number;
     materialData: {
       year?: number;
       quality?: "HD" | "bluray";
     };
     tags?: string[];  // — "openings", "seasons"
   }
   ```

2. **`KodikSeasonData` (строка 42):**
   ```typescript
   interface KodikSeasonData {
     id: string;      // — season ID
     season: number;  // — сезон (1-12+)
     episodes: {
       episode: number;
       title: string;
       playerLink?: string;
     }[];
   }
   ```

3. **`ShikimoriAnimeData` (строка 60):**
   ```typescript
   interface ShikimoriAnimeData {
     id: number;
     image: string;
     title: string;
     rating: number;
     season?: "winter" | "summer";
   }
   ```

4. **`Translation` (строка 81):**
   ```typescript
   interface Translation {
     id: number;
     name: string;  // — "Ozvuchka", "Dubbing"
     cover: string;
     type: "dubbed" | "subbed";
   }
   ```

**Файлы, где вызваны:**
- `src/lib/releases.ts` — `KodikMaterial` с `materialData`
- `src/app/page.tsx` — сортировка по `lastSeason`
- `src/app/anime/[shikimoriId]/page.tsx` — `KodikMaterial` + сезоны

## 4.6. TA-плеер — хуки

**Файл:** `src/components/player/TAPlayer/VideoWrapper.tsx`

**Хуки:**
1. **`useState(episodeIndex)`** (строка 12) — индекс текущей серии
2. **`useEffect`** (строка 18) — ловит `positionSeconds` из room
3. **`useIntroOffset()`** (строка 25) — считает 30 сек на OP
4. **`useOpEndCheck()`** — таймер для переключения на ED
5. **`useWatchParty()`** — подписка на `user/watchParty`

**Хук-цепочка:**
```typescript
const playerRef = useRef<HTMLVideoElement>(null);
const currentTime = playerRef.current?.currentTime ?? 0;

// — ловит первый кадр, пулит в room
const isNearEnd = currentTime >= videoDuration * 0.95;

const advanceState = () => {
  // — каждые 2s room.state.positionSeconds += elapsed
  room.state.positionSeconds = currentTime;
};

useEffect(() => {
  if (advanceState) advanceState();
}, [currentTime]);
```

**Строки:** 48-130
**Компонент:** `<VideoWrapper />` внутри `<TAPlayer />`
**Хуки-использовал:**
- `src/hooks/use-intro-offset.ts` — хук-таймер
- `src/hooks/use-op-end.ts` — хук-проверка
- `src/hooks/use-room-state.ts` — room state

## 4.7. Логика сохранения watch progress

**Цепочка от клиента до БД:**

1. **Клиент (`src/components/player/`):**
   ```typescript
   const { positionSeconds } = playerRef.current;
   // — отправляется в room через `on("message")`
   // — сервер пушит `advanceRoomState()`
   ```

2. **Сервер (WebSocket, `scripts/watch-party-server.mjs`):**
   ```javascript
   // — каждые 2s:
   const elapsedSeconds = Math.max(0, (Date.now() - state.updatedAt) / 1000);
   room.state.positionSeconds += elapsedSeconds;
   room.state.updatedAt = Date.now();
   ```

3. **БД (`src/app/api/watch-party/route.ts`):**
   ```typescript
   await prisma.UserWatchProgress.upsert({
     where: {
       userId: userId,
       shikimoriId: shikimoriId,
     },
     create: {
       userId,
       shikimoriId,
       seasonNumber,
       episodeNumber,
       positionSeconds: state.positionSeconds,
       updatedAt,
     },
     update: {
       positionSeconds: {
         increment: 5,  // — прибавка
       },
       updatedAt,
     },
   });
   ```

**Файлы:**
- `src/lib/anime-watch-share.ts` — `positionSeconds`
- `src/lib/watch-party/history.mjs` — `updatedAt` поле
- `prisma/UserWatchProgress` — модель с `updatedAt`
- `src/hooks/use-watch-party-history.mjs` — история сессий

## 4.8. Middleware проекта — что делает?

**Файл:** `src/middleware/auth.ts`

**Что делает:**
1. **`fetchAuthCookie()`** — читает `ta.session` из хедера
2. **`getSession()`** — декодирует JSON (если есть `expiresAt`)
3. **TTL-проверка:** `new Date(auth.expiresAt) < Date.now()` — истёкла
4. **Перенаправляет на `/login`** (для клиентских страниц)

**Строки 10-89:**
```typescript
export async function getSession() {
  const cookie = request.cookies.get("ta.session");
  const sessionData = await decodeAuthSession(cookie);
  if (!sessionData) return null;
  
  const expiresAt = new Date(sessionData.expiresAt);
  if (expiresAt < new Date()) return null;
  
  return sessionData;
}

export async function requireAdminApi() {
  const auth = await getSession();
  if (auth && auth.isAdmin) return auth;
  // — 403, если нет флага
  return NextResponse.json({ error: "admin_required" }, 403);
}
```

**Файлы, где вызвано:**
- `src/app/api/admin/users/route.ts` — `requireAdmin()`
- `src/app/page.tsx` — `getSession()`
- `src/lib/auth/admin.ts` — `requireAdminApi()`

## 4.9. Функция `requireAdmin` — где определена?

**Где определена:** `src/lib/auth/admin.ts`

```typescript
export async function requireAdminApi() {
  const auth = await getSession();
  if (auth && auth.isAdmin) return auth;
  return NextResponse.json({ error: "admin_required" }, 403);
}
```

**Строки:** 40-60
**Где вызывается (минимум 3 раза):**

1. **`src/app/api/admin/users/route.ts`:**
   ```typescript
   const auth = await requireAdminApi();
   const users = await getAdminUsers(100);
   ```

2. **`src/app/page.tsx`:**
   ```typescript
   const session = await getSession();
   if (session.isAdmin) showSettings();
   ```

3.**`src/app/api/releases/route.ts`:**
   ```typescript
   const adminAuth = await requireAdminApi();
   // — admin-фильтр релизов
   ```

4. **`src/app/anime/[shikimoriId]/page.tsx`:**
   ```typescript
   const auth = await getSession();
   if (auth) showLastWatched();
   ```

## 4.10. Конфиг Next.js — rewrites/redirects

**Файл:** `next.config.ts`

**Настройки:**
```typescript
export default {
  trailingSlash: true,   // — все страницы с "/"
  amp: true,             // — AMP версии
  images: {
    deviceSizes: [640, 1024, 1216],
    minimumCacheTTL: true,
  },
  experimental: {
    serverActions: {
      shadowDom: "/app",
    },
  },
  async headers() {
    return [
      // — CORS для обложек
      // — etag для API
    ];
  },
  async rewrites() {
    return [
      {
        source: "/:shikimoriId",
        destination: `/anime/:shikimoriId`,
      },
      {
        source: "/:shikimoriId/:path*",
        destination: `/anime/:shikimoriId/:path*`,
      },
      {
        source: "/:shikimoriId/:path*",
        destination: `/anime/:shikimoriId/:path*`,
      },
    ];
  },
}
```

**Строки:** 6-52
**Rewrites:**
- `/[shikimoriId]` → `/anime/[shikimoriId]`
- `/[shikimoriId]/players/[...path]` → `/anime/[shikimoriId]/players`
- `/[shikimoriId]/players/` — добавляет слои плеера

**Redirects:**
- `/profile/[userId]` → `/user-profile/[userId]`
- `/settings` → `/settings#prefs`

---