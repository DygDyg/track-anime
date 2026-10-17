# Оценка теста Track Anime (Qwen 3.5 через Hermes)

Сравнение с эталоном: `test/etalon/` + проверка по реальному коду.  
Прогон: **08.10.2026**, файлы в `test/results/` (все 10 + эта `EVALUATION.md`).

Предыдущий «EVALUATION.md» модели — чеклист для оценщика с выдуманными путями (`use-intro-offset.ts`, `components/player/`), **не** итоговый балл. Заменён этим файлом.

## Итог: ~35/100

Сильнее провала Codex (~16): все разделы заполнены, есть объём и попытки цитировать строки.  
Близко к `results_v1` (~38), но **не лучше по сути**: модель часто пишет правдоподобный код/пути, которых в репо нет.

| Критерий | Вес | Балл | Почему |
|----------|-----|------|--------|
| Корректность | 30% | **9/30** | Верхний слой стека/инвариантов частично ок; критичные ошибки + масса выдуманных модулей |
| Полнота | 20% | **18/20** | Все 10 файлов, почти все вопросы закрыты текстом |
| Конкретность | 20% | **5/20** | Много «строк» и сниппетов, но они выдуманы; реальные номера почти не совпадают |
| Конвенции в коде | 15% | **5/15** | Раздел 9 есть, но чужой стиль/импорты/ошибки на EN |
| Баги / рефакторинг | 15% | **3/15** | Анализ опирается на несуществующий код; реальные баги эталона не пойманы |

---

## Сравнение прогонов

| Прогон | Среда | Оценка |
|--------|-------|--------|
| Qwen 3.5 stubs | Codex ChatGPT | ~16 |
| Qwen (старый) | `results_v1` | ~38 |
| **Qwen 3.5** | **Hermes** | **~35** |

Hermes выиграл у Codex по **сдаче формата**, не по точности знания репо.

---

## Раздел 1 — Архитектура: ~5/10

**Ок:** Next.js 16 App Router, PostgreSQL, Prisma, `next.config.ts`, `.env.example`; `saveKodikMaterial` / `saveSeasonsAndEpisodes` / `trackLatestRelease`; запрет прямых browser→Shikimori/Kodik; cover chain файлы частично; brand rotation WEBP + `brand-rotation.ts`; watch-party: `watch-party-server.mjs`, heartbeat 30s, state-sync 2s, передача мастера.

**Ошибки / выдумки:**
- `src/lib/kodik-*` как клиент — реально `src/kodik/`
- Клиент: `src/components/player/`, `use-anime-data.ts` — **ФАЙЛ НЕ НАЙДЕН** (плеер в `src/components/anime/`)
- Dynamic routes: нет `profile/[userId]`, нет `players/[...path]` → есть `user/[shikimoriId]`
- Email как существующий канал — **не подтверждено**
- `src/lib/watch-party/types.ts`, `api/watch-party/` как основной API — слабо / частично выдумано (хук `useWatchParty.ts`)
- `src/app-brand.ts` — сомнительный путь vs реальные brand modules

## Раздел 2 — Инварианты: ~3/8

**Ок:** progress `(userId, shikimoriId)`; несколько materials на один `shikimoriId`; `KodikMaterial` ≈ аниме+озвучка; `getSession` / `requireAdminApi`; `KodikSyncRun` + `KodikImportJob`.

**Критично неверно:**
- **2.1** главный ключ назван `kodikId` — эталон:  
  `Shikimori anime.id === Kodik shikimori_id === /anime/[shikimoriId]`
- **2.2** «CORS + cache» вместо серверного инварианта (токены / rate limit); `proxy.ts` не auth-guard
- **2.5** примеры строк выдуманы (`Button label="Смотрю сейчас"` и т.п.), без реальных файлов/строк
- **2.8** объяснение через «сезоны как разные materials» — доменно слабее (главное: разные **озвучки**/`translationId`)

## Раздел 3 — Бизнес-логика: ~3/10

**Ок по направлению:** `getRecentReleasesPage` / `releases.ts`; watch-party join/state-sync; `save-material` → `KodikEpisodeRelease`.

**Выдумки:**
- `UserHistory`, `home-feed.ts`, `active-tweets.ts`, `anime-data-loader.ts`, `intro-offset.ts`, `use-intro-offset.ts`, `components/sections/RecentReleases/`
- Поиск описан как Prisma `findMany` + `contains` — реально `$queryRaw` + `escapeIlikePattern`
- OAuth: `callback/.../page.tsx` → реально `route.ts`; выдуман countdown 15s / создание KodikMaterial в callback
- QR: выдуман единый `/api/qr-login`, webcam-flow; эталон: `request` / `status` / `decision` / `claim`
- OP/ED: AniSkip + skip-times API не названы; вместо этого выдуманные 30s/65s константы
- Next-episode: выдуман TAPlayer 95% duration, не `AnimeWatchPanel` near-end окна

## Раздел 4 — Навигация: ~2/10

**Ок:** файл `releases.ts`; идея cover route; `requireAdmin*` в `admin.ts`; schema path.

**Ошибки:**
- Сигнатура `getRecentReleasesPage(query, limit, sortBy)` — **неверно**; реально `(pageSize, cursor?)`
- Callback `page.tsx` — нет; типы в `src/lib/anime-types.ts` — нет (`src/kodik/types.ts` / `src/kodik/anime-types.ts`)
- Progress через watch-party WS upsert — **неверно**; цепочка: `AnimeWatchPanel` → `PUT watch-history` → `upsertWatchProgress`
- `src/middleware/auth.ts` — **ФАЙЛ НЕ НАЙДЕН**; есть `src/proxy.ts` (legacy redirect only)
- `next.config.ts`: выдуманы `rewrites`, `amp`, `trailingSlash` — в файле их **нет**

## Раздел 5 — Баги: ~1/5

| # | Вердикт |
|---|---------|
| 5.1 | **Ложно.** Анализирует несуществующий `findMany`/`contains`. Реально tagged `$queryRaw` + `escapeIlikePattern` → SQLi **НЕ ПОДТВЕРЖДЕНО** |
| 5.2 | Мимо. Эталон: двухфазный cursor `hasMore: true` → catalog |
| 5.3 | Путаница; эталон про отсутствие гарантированного placeholder / 404 |
| 5.4 | Направление «нет per-IP limit» слабо угадано; `withPublicSearchSlot` не упомянут; фикс через `unstable_cache` неверен |
| 5.5 | Race назван по файлу; детали/фиксы на выдуманном коде |

## Раздел 6 — Рефакторинг: ~1/5

Почти всё опирается на **несуществующие** `recent-releases-page.ts`, дубли `getShikimoriAnimeData` в search, etc.  
Эталонные цели (`AnimeWatchPanel` god-component, `parseGenreList` дубли, silent catch в watch panel / `useWatchParty`) не попали.

## Раздел 7 — Конвенции: ~2/5

Частично: kebab lib, PascalCase components, `server-only`, `"use client"`.  
7.5 «5 правил из CONVENTIONS» — **не те** (выдуманы JSON charset / cover 7 sources / WP 2s как «правила CONVENTIONS»). Реальные: naming, `@/*`, server/client, auth patterns, docs impact check.

## Раздел 8 — Документация: ~2/5

Направление docs impact слабое: для bookmarks почти нет `CODEBASE_MAP` / `BUSINESS_LOGIC` / `PROJECT_OVERVIEW` по таблице impact; много нерелевантного `recent-releases-page.ts`. Email-канал частично угадан (`types`/`dispatcher`), без `.env.example` / `channels/email.ts` / prefs.

## Раздел 9 — Генерация кода: ~2/5

- 9.1: `"unauthorized"` EN; `prisma` из `@/db/prisma` (в проекте `@/lib/prisma`); модель `UserBookmark` vs существующий `UserAnimeBookmark`; лишние `material`/`history` relations
- 9.2: жанры не через `KodikMaterialGenre` / `genreKey`; неверный where по JSON
- 9.3: нет `Link` + `buildSearchHref`; чужой `Badge` UI kit
- 9.4: rate limiter **сломан** (`Map` внутри вызова, нет отказа 429)
- 9.5: JSON «migration» вместо prisma migrate SQL/schema; не отмечено пересечение с `UserAnimeBookmark`

## Раздел 10 — Edge cases: ~2/5

| # | Вердикт |
|---|---------|
| 10.1 | Выдуманный `fetchShikimoriId` flow; эталон: `getAnimePageData` → metadata без materials / `notFound()` |
| 10.2 | Unique key ок; дальше уведено в watch-party вместо last-write-wins на `watch-history` |
| 10.3 | Нет `KodikSyncRun` status=error / rethrow; выдуман retry |
| 10.4 | Не сказано ясно: после expiry PUT → 401, новые сохранения теряются |
| 10.5 | Передача мастера `clients.keys().next()` — **по сути верно** (как эталон) |

---

## Главный паттерн ошибок

1. **Fluent hallucination** — длинные «цитаты» кода с номерами строк, которых нет.
2. **Путает доменный ключ** (`kodikId` вместо `shikimoriId` equality).
3. **Изобретает дерево файлов** (`components/player`, `middleware/auth`, `recent-releases-page`, `home-feed.ts`).
4. Почти не пишет `ФАЙЛ НЕ НАЙДЕН` / `НЕДОСТАТОЧНО ДАННЫХ` / `НЕ ПОДТВЕРЖДЕНО`.
5. Самооценка-чеклист в старом `EVALUATION.md` тоже галлюцинирует — нельзя доверять.

## Что засчитать как сильные места

- Полная сдача всех 10 разделов
- Стек / Prisma / OAuth custom / cover / brand WEBP / watch-party server timings
- Progress uniqueness и multi-material на `shikimoriId`
- `KodikSyncRun` / `KodikImportJob`
- Верная идея передачи роли мастера
- Понимание, что search/API живут на сервере

## Рекомендация

**~35% — слабо / ниже среднего.** Hermes дал объём и формат, но модель **уверенно выдумывает реализацию**. Нельзя использовать без построчной сверки с диском.  
Относительно Codex-прогона (~16): большой плюс за полноту и раздел 9; относительно `results_v1` (~38): паритет / чуть хуже из‑за ложных «доказательств» строками.

Docs: обновление проектных docs не требуется (оценка только здесь).
