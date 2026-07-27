## 4.1
`getRecentReleasesPage` определена в `src/lib/releases.ts:570-577`.
Сигнатура: `getRecentReleasesPage(pageSize: number, cursor?: ReleasesCursor | null)`.

## 4.2
OAuth callback от Shikimori обрабатывается в `src/app/api/auth/callback/shikimori/route.ts:47-132`.

## 4.3
Prisma schema: `prisma/schema.prisma`.
5 ключевых моделей:
- `KodikMaterial` — одно аниме + одна озвучка, `188-222`.
- `KodikEpisodeRelease` — лента новых серий, `255-275`.
- `User` — пользователь сайта, `278+`.
- `Session` — сессии auth, `491+`.
- `UserWatchProgress` — прогресс просмотра, `504+`.

## 4.4
Проксирование обложек: `src/app/api/cover/route.ts:75-205`.
Route: `GET /api/cover`.

## 4.5
Типы Kodik API лежат в `src/kodik/types.ts` и используются, например, в `src/db/save-material.ts:2`.
Из реально подтверждённых интерфейсов в этом проходе:
- `KodikMaterial`
- `KodikSeason`
- `KodikEpisodeValue`
Подтверждение использования: `src/db/save-material.ts:1-2`.
Для полного перечня интерфейсов файла `src/kodik/types.ts`: `НЕДОСТАТОЧНО ДАННЫХ` в этом эталонном проходе.

## 4.6
Компонент TA/Kodik player: `src/components/anime/KodikPlayer.tsx`.
Хуки:
- `useRef` — refs на позиции, callbacks, iframe state — поиск показал `297-312`.
- `useEffect` — много side effects, строки `374-398`, `409`, `549`, `657`.
- `useImperativeHandle` — `425`.

## 4.7
Цепочка сохранения watch progress:
1. Client component `AnimeWatchPanel` работает с `KodikPlayer` и собирает progress callbacks — `src/components/anime/AnimeWatchPanel.tsx`.
2. API route `PUT /api/user/watch-history/[shikimoriId]` — `src/app/api/user/watch-history/[shikimoriId]/route.ts:33-89`.
3. Server function `upsertWatchProgress()` — `src/lib/watch-history.ts:320-358`.
4. DB upsert в `prisma.userWatchProgress.upsert(...)` — `src/lib/watch-history.ts:334-355`.

## 4.8
Middleware/proxy: `src/proxy.ts:11-26`.
Он делает только redirect legacy `?shikimori_id=` -> `/anime/{id}` и не отвечает за auth.

## 4.9
`requireAdmin` и `requireAdminApi` определены в `src/lib/auth/admin.ts:5-31`.
Примеры вызовов:
- `src/app/api/admin/watch-party/rooms/route.ts`
- `src/app/api/admin/notifications/settings/route.ts`
- `src/app/api/admin/search/settings/route.ts`
- `src/app/api/admin/sync/route.ts`

## 4.10
Конфиг Next.js: `next.config.ts:1-49`.
Подтверждённое содержимое:
- `allowedDevOrigins` — `6`.
- custom `headers()` для `/downloads/TrackAnimeDiscordRPC.exe` — `7-23`.
- image local/remote patterns — `24-46`.
`rewrites`/`redirects` в `next.config.ts` не настроены.
Redirect legacy query реализован не через `next.config`, а через `src/proxy.ts:11-26`.
