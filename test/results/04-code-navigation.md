# Раздел 4 — Навигация по коду

## 4.1. `getRecentReleasesPage`

**Файл:** `src/lib/releases.ts` **605–613**

```typescript
export async function getRecentReleasesPage(pageSize: number, cursor?: ReleasesCursor | null)
```

Параметры: `pageSize: number`, опциональный `cursor?: ReleasesCursor | null` (`phase`, `releasedAt`, `id` — тип ~69–74). Обёртка над `getRecentReleasesPageUncached` с `unstable_cache` и tag `"releases"`.

## 4.2. OAuth callback Shikimori

**Файл:** `src/app/api/auth/callback/shikimori/route.ts`  
**Entry:** `GET` ~строка 47.  
Обмен code → `exchangeShikimoriCode` → upsert user → `createSession` → redirect + cookie (~89–121).

## 4.3. Prisma schema

**Файл:** `prisma/schema.prisma`

| Модель | Назначение |
|--------|------------|
| `KodikMaterial` | Аниме + одна озвучка Kodik |
| `KodikEpisodeRelease` | Источник ленты новых серий |
| `User` / `Session` | Пользователь и cookie-сессия |
| `UserWatchProgress` | Прогресс просмотра |
| `AnimeExternalIdMap` | shikimoriId → malId |

(+ `KodikImportJob`, `KodikSyncRun`, notifications models.)

## 4.4. Cover proxy

**Route:** `src/app/api/cover/route.ts` — `GET`  
**URL:** `/api/cover?id={shikimoriId}` (+ `url`, `size`, `force`)  
Логика источников: `src/lib/poster-fallback.ts`, клиентские URL: `src/lib/poster.ts`.

## 4.5. Типы Kodik API

**Файл:** `src/kodik/types.ts`

- `KodikTranslation` (~1–5)
- `KodikEpisodeValue` (~7–13)
- `KodikSeason` (~15–19)
- `KodikMaterial` (~21–56)
- `KodikListResponse` (~58–64)
- `KodikSearchResponse` (~66–70)

Также: `src/kodik/anime-types.ts` — `KODIK_ANIME_LIST_TYPES`.

## 4.6. TA-плеер / KodikPlayer

**Файл:** `src/components/anime/KodikPlayer.tsx`

Хуки: `useRef`, `useEffect`, `useImperativeHandle` (+ `forwardRef`).  
`useState` / `useCallback` / `useMemo` в компоненте не используются (состояние снаружи / refs).

## 4.7. Watch progress: клиент → БД

1. `AnimeWatchPanel.tsx` ~986–1038 — `saveProgressNow` → `PUT /api/user/watch-history/${shikimoriId}`
2. `src/app/api/user/watch-history/[shikimoriId]/route.ts` 33–93 — `getSession` → `upsertWatchProgress`
3. `src/lib/watch-history.ts` ~330–371 — `prisma.userWatchProgress.upsert` по `userId_shikimoriId`

## 4.8. Middleware / proxy

Классического `middleware.ts`: **ФАЙЛ НЕ НАЙДЕН**.

Есть `src/proxy.ts` 11–26: если query `shikimori_id` валиден → redirect 308 на `/anime/{id}`; иначе `NextResponse.next()`. Auth не проверяет.

## 4.9. `requireAdmin`

**Определение:** `src/lib/auth/admin.ts` 5–14 (`requireAdmin`), 16–25 (`requireAdminApi`).

Вызовы (≥3):
1. `src/app/admin/layout.tsx` ~16 — `requireAdmin()`
2. `src/app/admin/notifications/page.tsx` ~8
3. `src/app/api/admin/sync/route.ts` ~10 — `requireAdminApi()`
4. `src/app/api/admin/users/route.ts`, `src/app/api/admin/watch-party/rooms/route.ts`

## 4.10. Next.js config

**Файл:** `next.config.ts`

- Есть: `allowedDevOrigins`, `headers()` (Discord RPC exe), `images.localPatterns` / `remotePatterns`
- **rewrites / redirects:** не настроены в этом файле
- Обёртка: `withSerwist(nextConfig)`
