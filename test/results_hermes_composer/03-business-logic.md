# Раздел 3 — Бизнес-логика

## 3.1
Home feed flow:
1. **DB:** строки `KodikEpisodeRelease` (+ join к material/meta) — schema ~374+.
2. **Server lib:** `getRecentReleasesPage(pageSize, cursor?)` / `getRecentReleasesPageLive` — `src/lib/releases.ts:605+`, `616+`; фазы `releases` → `catalog`.
3. **API:** `GET /api/releases` — `src/app/api/releases/route.ts` (items, nextCursor, hasMore; `live=1` без cache).
4. **SSR home:** `src/app/page.tsx` — session, initial page data, `getHistoryNewEpisodes(session.user.id)` для авторизованных — `history-new-episodes.ts:85+`.
5. **Client:** `ReleaseFeed` — `src/components/ReleaseFeed.tsx:54+` (infinite scroll, merge head, polling); карточки `ReleaseCard`, hover `ReleaseCardHoverPanel`.

## 3.2
Фильтр «завершённые тайтлы»:
- Константа **`COMPLETED_SERIES_MAX_AGE_DAYS = 90`** — `src/lib/releases.ts:165`.
- Helper даты cutoff — `releases.ts:170` (`Date.now() - 90 days`).
- В SQL/feed expr: `INTERVAL '90 days'` — `releases.ts:200`, `456`.
- Смысл: «старые completed» уходят из «свежей» фазы releases в **catalog** part ленты (не исчезают полностью), см. `BUSINESS_LOGIC.md` + phase cursor.

## 3.3
Страница аниме:
1. `src/app/anime/[shikimoriId]/page.tsx` парсит id → `getAnimePageData(shikimoriId)` — `anime-page.ts:402+`.
2. Загрузка: Shikimori metadata (cache/live), materials/translations из PG, poster URLs, related snapshots и т.д.
3. Если `!anime && materials.length === 0` → `null` → page `notFound()` — `anime-page.ts:435`, `page.tsx:77-78`.
4. Рендер: server layout metadata + client **`AnimeWatchPanel`** (плеер, прогресс, skip, watch party, lists) + **`KodikPlayer`** iframe/postMessage.

## 3.4
Переключение на следующую серию (TA-плеер / watch panel):
- Не только нативный `ended`: near-end окно **`EPISODE_END_CANDIDATE_WINDOW_SECONDS = 20`** — `AnimeWatchPanel.tsx:197`.
- Watch-party end guard **`WATCH_PARTY_END_GUARD_SECONDS = 1.25`**, hold offset **1.5** — строки `198-199`; проверки ~1073-1085, ~2888.
- Docs: «примерно за секунду до конца» — `BUSINESS_LOGIC.md`; в коде guard ~1.25s до duration, плюс candidate window 20s для прогресса/ended-логики.
- Точные все ветки (solo vs party, CVH vs Kodik) размазаны по ~4k LOC файла; базовое поведение подтверждено константами и near-end checks.

## 3.5
Автопропуск OP/ED:
- Тайминги: AniSkip (+ cache model `AnimeEpisodeSkipTime`), API `/api/anime/[shikimoriId]/skip-times`; MAL id через `AnimeExternalIdMap`.
- В панели: fetch skip-times, диагностика source cache|aniskip|missing-mal-id.
- **Intro-offset:** сдвиг интервалов под конкретную озвучку — `applyIntroOffset`, `resolveTranslationIntroOffsetSec` из `src/lib/translation-intro-offset.ts`; вызовы в `AnimeWatchPanel.tsx:42,679,1943`.
- Админ/forced offsets: `useForcedTranslationIntroOffsets`, admin translation-intro-offsets lib.

## 3.6
Watch party:
1. UI/URL: параметр комнаты (`watchRoom`), hook `useWatchParty`.
2. Settings: `GET /api/settings/watch-party` (enabled, limits).
3. WS: `/watch-party-ws` → `scripts/watch-party-server.mjs`.
4. `join` создаёт room или вступает; первый → master (`masterParticipantId`).
5. Master шлёт play/pause/seek/episode/translation; peers применяют; `state-sync` / `request-sync` / `presence`.
6. Leave master → next client keys — server `handleLeave` ~262-281.

## 3.7
Поиск:
- **Движок:** PostgreSQL raw SQL через Prisma **`$queryRaw` tagged templates** + ILIKE + ranking CTE — **`src/lib/search.ts`** (не Elasticsearch).
- Entry points: `searchAnimesQuick` ~1098, `searchAnimesByDescription` ~1114, `searchAnimesAdvanced` ~1141, `searchAnimes` ~715, `searchAnimesByGenre` ~1037.
- API: `src/app/api/search/route.ts:13+` (mode quick/advanced/description).
- Shared: `escapeIlikePattern`, `buildSearchHref` — `src/lib/search-shared.ts:34+`, `68+`.
- Protection: `withPublicSearchSlot` — `search-protection.ts`.

## 3.8
OAuth Shikimori:
1. Старт: `/api/auth/shikimori` (redirect + state cookie).
2. Callback: **`src/app/api/auth/callback/shikimori/route.ts`** — validate state → exchange code → whoami → upsert user → `createSession()` → set cookie → redirect.
3. Session: `src/lib/auth/session.ts` (`getSession`, `createSession`).
4. Tokens: model `ShikimoriAccount` в schema.

## 3.9
QR-login:
1. `POST /api/auth/qr/request` → `createQrLoginRequest()` — `src/lib/auth/qr-login.ts`, route `qr/request`.
2. Poll `GET /api/auth/qr/status`.
3. Авторизованный клиент: `POST /api/auth/qr/decision` (approve/deny).
4. Инициатор: `POST /api/auth/qr/claim` → session cookie.
5. TTL константа в `qr-login.ts` (типично ~3 min).

## 3.10
Kodik sync:
1. `runKodikIncrementalSync` — `src/lib/admin/kodik-sync.ts:41+`; run row `KodikSyncRun`.
2. Для каждого material: `saveKodikMaterial` — обновляет material, seasons/episodes.
3. **Новая серия:** сравнение last season/episode с previous в `trackLatestRelease` — `save-material.ts:326+`.
4. При новой серии: **`prisma.kodikEpisodeRelease.create`** ~354.
5. Ошибка API: catch → `status: "error"`, lastError, rethrow — `kodik-sync.ts:195-210`; **внутреннего retry нет** (см. 10.3).
