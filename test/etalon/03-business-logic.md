## 3.1
Home feed flow:
1. Источник данных: `KodikEpisodeRelease` — `BUSINESS_LOGIC.md:20-27`, `prisma/schema.prisma:255-275`.
2. Серверная пагинация: `getRecentReleasesPage()` / `getRecentReleasesPageLive()` — `src/lib/releases.ts:526-582`.
3. API route: `/api/releases` -> `src/app/api/releases/route.ts:32-59`.
4. Для авторизованных есть отдельный блок `getHistoryNewEpisodes()` — `BUSINESS_LOGIC.md:23-27`, `src/lib/history-new-episodes.ts:85-180+`.
5. Клиентский рендер: `ReleaseFeed` упомянут в `BUSINESS_LOGIC.md:25`.

## 3.2
Фильтр завершённых тайтлов:
- По docs: завершённые более 90 дней назад переносятся в catalog part feed — `BUSINESS_LOGIC.md:23`.
- Кодовый порог в этом проходе я не дочитал до конкретной константы в `src/lib/releases.ts`, поэтому для точного места: `НЕДОСТАТОЧНО ДАННЫХ`.

## 3.3
Flow страницы аниме:
1. Server page вызывает `getAnimePageData(shikimoriId)` — `src/lib/anime-page.ts:371+`.
2. Загружаются Shikimori metadata, Kodik translations из БД, постер, скриншоты и т.д. — тип DTO в `src/lib/anime-page.ts:23-60`.
3. Клиентский `AnimeWatchPanel` получает `translations` и поднимает интерактивную логику плеера — `src/components/anime/AnimeWatchPanel.tsx:290-317+`.
4. Внутри него рендерится `KodikPlayer` и related beta controls — `src/components/anime/AnimeWatchPanel.tsx:15-23`.

## 3.4
Автопереход на следующую серию:
- По docs TA-плеер переключает следующую серию примерно за секунду до конца, не дожидаясь стандартного end event — `BUSINESS_LOGIC.md:52-53`.
- В коде есть near-end guard/window: `EPISODE_END_CANDIDATE_WINDOW_SECONDS = 20`, `WATCH_PARTY_END_GUARD_SECONDS = 1.25` и проверки около конца трека — `src/components/anime/AnimeWatchPanel.tsx:82-85`, поиск показал логику на `612-624`.
- Для exact branching всех условий нужен полный разбор большого файла; в этом эталоне: поведение подтверждено частично, детали всех веток `НЕ ПОДТВЕРЖДЕНО`.

## 3.5
Автопропуск OP/ED:
- Тайминги берутся через `/api/anime/[shikimoriId]/skip-times` — `BUSINESS_LOGIC.md:46-49`, `src/components/anime/AnimeWatchPanel.tsx:1397`.
- Источник: AniSkip + cache, есть диагностика источника `cache|aniskip|missing-mal-id` — `src/components/anime/AnimeWatchPanel.tsx:186-199,236-244`.
- Intro offset применяется через `applyIntroOffset()` и вычисляется `resolveTranslationIntroOffsetSec()` — `src/components/anime/AnimeWatchPanel.tsx:38,404,1166`.
- Смысл intro-offset: смещать интервалы относительно локальных заставок конкретной озвучки — `BUSINESS_LOGIC.md:48`.

## 3.6
Watch party:
1. Клиент может создать или подключиться к комнате по `watchRoom` в URL — `src/hooks/useWatchParty.ts:92-128`.
2. Runtime settings загружаются с `/api/settings/watch-party` — `src/hooks/useWatchParty.ts:184-209`, `src/app/api/settings/watch-party/route.ts:6-8`.
3. Подключение идёт по WebSocket `/watch-party-ws` — `src/hooks/useWatchParty.ts:79-90`.
4. Сервер принимает `join`, создаёт комнату или подключает к существующей — `scripts/watch-party-server.mjs:152-212`.
5. Состояние комнаты синхронизируется через `room-state`, `command`, `presence`, `request-sync`, `state-sync` — `scripts/watch-party-server.mjs:109-132,278-340`.

## 3.7
Поиск:
- Серверный raw SQL/Prisma search в `src/lib/search.ts`.
- Быстрый поиск: `searchAnimesQuick()` — `src/lib/search.ts:908-919`.
- По описанию: `searchAnimesByDescription()` — `src/lib/search.ts:923-940`.
- Advanced: `searchAnimesAdvanced()` — `src/lib/search.ts:944-953`.
- Реальные raw SQL: `prisma.$queryRaw` на `188`, `328`, `345` и дальше.

## 3.8
OAuth flow Shikimori:
1. Старт OAuth route: `/api/auth/shikimori`.
2. Сохраняется OAuth state/cookies, затем redirect на Shikimori — описано в `ARCHITECTURE.md:38-48`.
3. Callback: `src/app/api/auth/callback/shikimori/route.ts:47-132`.
4. Там: validate state -> exchange code -> `fetchShikimoriWhoami()` -> `upsertShikimoriUser()` -> `createSession()` -> set session cookie.

## 3.9
QR login:
1. Новое устройство создаёт запрос: `POST /api/auth/qr/request` -> `createQrLoginRequest()` — `src/app/api/auth/qr/request/route.ts:6-8`, `src/lib/auth/qr-login.ts:26-34`.
2. Проверка статуса: `/api/auth/qr/status` — `src/app/api/auth/qr/status/route.ts:6-11`.
3. Авторизованный пользователь с телефона подтверждает/отклоняет: `/api/auth/qr/decision` — `src/app/api/auth/qr/decision/route.ts:7-18`.
4. Браузер-инициатор забирает session token через `/api/auth/qr/claim` — `src/app/api/auth/qr/claim/route.ts:7-15`.

## 3.10
Kodik sync:
- История запусков хранится в `KodikSyncRun` — `prisma/schema.prisma:151-166`.
- Sync path указан в `ARCHITECTURE.md:76-79`.
- Материал обновляется через `saveKodikMaterial()` — `src/db/save-material.ts:71-176`.
- Новая серия определяется сравнением `(lastSeason,lastEpisode)` с предыдущими значениями — `src/db/save-material.ts:285-291`.
- При обнаружении новой серии создаётся `KodikEpisodeRelease` — `src/db/save-material.ts:301-315`.
