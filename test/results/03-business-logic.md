# Раздел 3 — Бизнес-логика

## 3.1. Home feed flow

```
KodikEpisodeRelease (+ catalog phase для старых completed)
  → getRecentReleasesPage / getRecentReleasesPageLive (src/lib/releases.ts)
  → page.tsx (SSR) + ReleaseFeed (client infinite scroll)
  → GET /api/releases?cursor=…
```

Дополнительно для авторизованных:
1. `getHistoryUpcomingSoon()` — «Скоро выйдут»
2. `getHistoryNewEpisodes()` — «Новое в вашей истории»

Компоненты: `ReleaseFeed.tsx`, карточки релизов, фильтры статуса/озвучек/score.

## 3.2. Фильтр «завершённые тайтлы» / 90 дней

Константа `COMPLETED_SERIES_MAX_AGE_DAYS = 90` — `src/lib/releases.ts` 165–170.

Логика: свежие релизы серий в фазе releases; завершённые тайтлы, у которых дата конца показа / релиза старше 90 дней, уходят в **каталожную** часть ленты (после актуальных), чтобы доозвучка не поднимала старый тайтл наверх. SQL: `INTERVAL '90 days'` ~200, ~456.

## 3.3. Страница аниме

1. `src/app/anime/[shikimoriId]/page.tsx` → `getAnimePageData(shikimoriId)` (`anime-page.ts`, React `cache`)
2. При отсутствии реальных materials → `ensureKodikMaterialsForShikimoriId`
3. Shikimori metadata (cache) + Kodik translations из БД + poster
4. Рендер: `AnimePageView` → метаданные/постеры/связи; `AnimeWatchPanel` → озвучки, история, плеер
5. Клиент: watch history GET, skip-times, `KodikPlayer` iframe, PUT progress

## 3.4. Автопереход на следующую серию (~1 с до конца)

`WATCH_PARTY_END_GUARD_SECONDS = 1.25` — `AnimeWatchPanel.tsx` ~198.

При `position >= duration - 1.25` (и вне/в комнате по разным веткам) вызывается `handlePlayerEnded` → `handleEpisodeSelect(nextEpisode)` ~2712–2729, ~2930–2937.

**Почему не ждать `ended` от Kodik:** событие окончания ненадёжно / приходит поздно; guard перехватывает заранее. Если следующей серии ещё нет в Kodik (`lastEpisode`/`lastSeason`) — переход не запускается.

## 3.5. Автопропуск OP/ED и intro-offset

- Источник: AniSkip API через `src/lib/aniskip.ts` → кэш `AnimeEpisodeSkipTime`
- Клиент: `GET /api/anime/[shikimoriId]/skip-times`
- **Intro-offset:** сдвиг таймингов под локальные заставки студии — `src/lib/translation-intro-offset.ts`, админка `/admin/intro-offsets`
- Автопропуск: чекбокс per-translation в `AnimeWatchPanel`; за 5 с до интервала — таймер с отменой; в watch party автоскип только у мастера

## 3.6. Watch party

1. Глобально `WatchPartySettings.enabled`
2. Создание комнаты / ввод 5-значного ключа → WebSocket `scripts/watch-party-server.mjs`
3. Ключ пишется в URL `watchRoom`
4. Master: play/pause/seek/episode/translation (+ permissions для участников)
5. `state-sync` каждые 2 с; клиенты правят позицию при drift > 1 с
6. Гости: «Гость NNNN» если `allowGuests`
7. Leave мастера → handoff следующему клиенту

## 3.7. Поиск

- Движок: **PostgreSQL raw SQL** через Prisma `$queryRaw` + `Prisma.sql` (`src/lib/search.ts`)
- Не Shikimori/Kodik live API
- Fuzzy / layout correction / description suggest; `search-shared.ts` — общие константы и `escapeIlikePattern`
- Route: `src/app/api/search/route.ts`

## 3.8. OAuth Shikimori

```
GET /api/auth/shikimori
  → state (cookie + OAuthState)
  → Shikimori authorize
GET /api/auth/callback/shikimori
  → exchangeShikimoriCode (shikimori-oauth.ts)
  → upsert user + ShikimoriAccount
  → createSession → cookie ta.session
```

Файлы: `src/app/api/auth/shikimori/route.ts`, `callback/shikimori/route.ts`, `src/lib/auth/shikimori-oauth.ts`, `session.ts`, `config.ts`.

## 3.9. QR-логин

1. Устройство A: `POST` create `QrLoginRequest` — показывает только код (без session token)
2. Устройство B (авторизовано): approve по коду
3. Устройство A: claim через browser-only secret → та же `Session`

Файлы: `src/lib/auth/qr-login.ts`; API `api/auth/qr/{request,status,decision,claim}`; UI `QrLoginRequest.tsx`, `QrLoginApprovalDialog.tsx`, `QrCodeScanner.tsx`, `src/app/login/qr/page.tsx`.

## 3.10. Kodik sync и новые серии

1. `kodik-sync.ts` тянет N recent pages (`types=anime,anime-serial`)
2. `saveKodikMaterial(..., { loadEpisodes, trackReleases: true })`
3. При новых эпизодах создаётся `KodikEpisodeRelease` внутри `save-material.ts` (seasons/episodes + trackReleases)
4. Run логируется в `KodikSyncRun`; при ошибке status=`error`
5. HTTP-retry в `src/kodik/client.ts` на 429/5xx
