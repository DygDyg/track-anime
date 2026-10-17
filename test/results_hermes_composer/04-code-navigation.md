# Раздел 4 — Навигация по коду

## 4.1
**Файл:** `src/lib/releases.ts`  
**Определение:** `export async function getRecentReleasesPage(pageSize: number, cursor?: ReleasesCursor | null)` — **строки 605-611** (unstable_cache wrapper).  
Uncached: `getRecentReleasesPageUncached` ~561+.  
Live: `getRecentReleasesPageLive` — **616-617**.

## 4.2
**Файл:** `src/app/api/auth/callback/shikimori/route.ts`  
(OAuth callback handler, не `page.tsx`.)

## 4.3
**Файл:** `prisma/schema.prisma`

5 ключевых моделей:
1. **`KodikMaterial`** (~306) — аниме+озвучка, каталог Kodik.
2. **`KodikEpisodeRelease`** (~374) — события ленты новых серий.
3. **`User`** — пользователь сайта.
4. **`Session`** — cookie-сессии.
5. **`UserWatchProgress`** (~642) — прогресс по `(userId, shikimoriId)`.

(+ важны: `AnimeExternalIdMap` ~81, `KodikSyncRun` ~270, `KodikImportJob` ~287.)

## 4.4
**Файл:** `src/app/api/cover/route.ts`  
**Route:** `GET /api/cover` (query `id` = shikimoriId, optional `size=thumb`).  
Helpers: `src/lib/poster.ts`, `src/lib/cover-cache.ts`.

## 4.5
**Файл:** `src/kodik/types.ts`

Ключевые типы:
- `KodikTranslation`
- `KodikEpisodeValue`
- `KodikSeason`
- `KodikMaterial`
- `KodikListResponse`
- `KodikSearchResponse`

Использование: `src/db/save-material.ts` imports.

## 4.6
**Компоненты:**
- Оболочка/логика: `src/components/anime/AnimeWatchPanel.tsx` (~4079 строк).
- Iframe/player: `src/components/anime/KodikPlayer.tsx`.

Хуки (панель/плеер):
- React: `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, …
- Проект: `useWatchParty` (`src/hooks/useWatchParty.ts`), Discord presence hooks, `useForcedTranslationIntroOffsets`, и др. по импортам в шапке `AnimeWatchPanel.tsx`.
- `KodikPlayer`: `useRef`, `useEffect`, `useImperativeHandle`.

## 4.7
Цепочка watch progress:
1. **Client:** `AnimeWatchPanel` / `KodikPlayer` callbacks position.
2. **API:** `PUT` `src/app/api/user/watch-history/[shikimoriId]/route.ts` (`getSession` → body validate).
3. **Lib:** `upsertWatchProgress` — `src/lib/watch-history.ts:330+`.
4. **DB:** `prisma.userWatchProgress.upsert` по `userId_shikimoriId`.

## 4.8
**Файл:** `src/proxy.ts` (Next 16 proxy convention; **не** классический `middleware.ts` auth).

**Что делает:** если query `shikimori_id` валиден → **308 redirect** на `/anime/{id}` и удаляет query; иначе `NextResponse.next()`.  
Matcher: всё кроме static/_next/favicon — `config.matcher` строки ~24-26.  
**Auth не проверяет.**

## 4.9
**Определение:** `src/lib/auth/admin.ts`
- `requireAdmin` — строка **5**
- `requireAdminApi` — строка **16**

Вызовы (минимум 3):
1. `src/app/api/admin/anime-debug/route.ts`
2. `src/app/api/admin/brand-rotation/settings/route.ts`
3. `src/app/api/admin/cover-cache/settings/route.ts`
4. `src/app/api/admin/sync/route.ts` (если есть)
5. `src/app/api/admin/db/search/route.ts`
(+ десятки других `api/admin/**`)

## 4.10
**Файл:** `next.config.ts`

Подтверждено:
- Serwist wrapper `withSerwist(nextConfig)`
- `allowedDevOrigins`
- custom `headers` для downloads (Discord RPC exe)
- `images` local/remote patterns

**`rewrites` / `redirects` в next.config — не настроены.**  
Legacy redirect — через `src/proxy.ts`, не next.config.
