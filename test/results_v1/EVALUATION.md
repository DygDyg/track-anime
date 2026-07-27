# Оценка теста Track Anime (локальная модель)

Сравнение с эталоном: `test/etalon/` + проверка по реальному коду.

## Итог: ~38/100

Самооценка модели в этом файле (95/100) **не подтверждается**. Много ответов выглядят правдоподобно, но опираются на **выдуманные файлы, модели и поля**.

| Критерий | Вес | Балл | Почему |
|----------|-----|------|--------|
| Корректность | 30% | **8/30** | Массовые галлюцинации путей/моделей/полей |
| Полнота | 20% | **18/20** | Все разделы заполнены, но часто поверхностно |
| Конкретность | 20% | **5/20** | Почти нет реальных номеров строк; много несуществующих файлов |
| Конвенции в коде | 15% | **4/15** | Англ. UI-ошибки, неверные Prisma-поля, чужой стиль |
| Баги / рефакторинг | 15% | **3/15** | 5.1 ошибочен; часть «находок» выдумана |

---

## Раздел 1 — Архитектура: ~4/10

**Ок:** Next.js App Router, PostgreSQL, Prisma, Shikimori/Kodik, OAuth; доменный ключ в 2.1/частично в 1.2.

**Ошибки / выдумки:**
- `next.config.js` → реально `next.config.ts`
- `.env` как «файл конфига» вместо `.env.example`
- `AnimeExternalIdMap.kodikId` — поля нет; есть `shikimoriId` / `malId`
- `KodikMaterial.shikimori_id` — в Prisma `shikimoriId`
- Цепочка sync: нет `src/kodik/materials.ts`, нет `src/lib/sync/kodik-sync.ts` → реально `src/kodik/client.ts`, `src/lib/admin/kodik-sync.ts`, `src/db/save-material.ts`
- Клиентские пути: `AnimePageView` / `KodikPlayer` лежат в `src/components/anime/`, не в корне `components/`
- Dynamic routes: нет `[userId]`, нет `[episodeNumber]`; есть `user/[shikimoriId]`, `anime/[shikimoriId]`
- Cache tags `release-feed` / `anime-page` / `user-progress` — **не подтверждено**; в releases используется tag `releases`
- Нотификации: пропущен browser push; каналы лежат в `channels/*`, не `telegram.ts` в корне
- Brand rotation описан неверно (не «разные клиенты», а ротация WEBP из `public/brand-logos`)
- Watch party: нет `WatchPartyPanel.tsx` / `api/watch-party/route.ts` → `useWatchParty.ts` + `scripts/watch-party-server.mjs`

## Раздел 2 — Инварианты: ~5/8

**Ок:** доменный ключ; прогресс по `(userId, shikimoriId)`; `KodikMaterial` = аниме + озвучка; несколько materials на один id.

**Ошибки:**
- 2.2: причина не «CORS + middleware», а серверный инвариант (токены/rate limit); `proxy.ts` не проверяет auth
- 2.5: примеры строк не сверены с кодом (пути компонентов сомнительны)
- 2.7: моделей `KodikSyncSettings` / `KodikSyncLog` нет → `KodikSyncRun`, `KodikImportJob`
- 2.4: пример без строк; admin API чаще `requireAdminApi()`, не только `requireAdmin()`

## Раздел 3 — Бизнес-логика: ~4/10

**Ок:** общая схема home feed; OAuth callback путь; releases создаются в `save-material`.

**Ошибки / выдумки:**
- `isAnimeCompleted` / `anime-completion.ts` — **ФАЙЛ НЕ НАЙДЕН**
- `anime-page-data.ts` — нет, есть `anime-page.ts` / `getAnimePageData`
- `anime-op-ed.ts` — нет; AniSkip + `/api/anime/.../skip-times`
- Watch party API path выдуман
- QR: нет единого `api/auth/qr/route.ts` → `request` / `status` / `decision` / `claim`
- 3.4 / 3.5 без файлов/строк и с неверной семантикой таймингов

## Раздел 4 — Навигация: ~3/10

**Ок:** OAuth callback path; `/api/cover`; `requireAdmin` в `admin.ts`; типы в `kodik/types.ts` частично.

**Ошибки:**
- `getRecentReleasesPage(pageSize, cursor?)`, не `(limit, cursor, userId)`
- `KodikSyncSettings` как ключевая модель — нет
- Цепочка progress: нет `api/user/progress` / `user-progress.ts` → `watch-history/[shikimoriId]` + `watch-history.ts`
- Middleware: нет `src/middleware.ts` → `src/proxy.ts` (только legacy redirect)
- `next.config.js` + «rewrites/redirects» — в `next.config.ts` их нет
- Путь плеера неточный; хуки без строк

## Раздел 5 — Баги: ~2/5

| # | Вердикт |
|---|---------|
| 5.1 | **Неверно.** `$queryRaw` tagged templates + `escapeIlikePattern` — это не «прямая подстановка без экранирования» |
| 5.2 | Слишком общее; эталон указывал на двухфазный cursor (`hasMore: true` → catalog) |
| 5.3 | По сути ок (нет дефолтного placeholder), но без строк |
| 5.4 | Частично ок; не упомянут `withPublicSearchSlot` |
| 5.5 | Направление ок, но без unique/upsert деталей |

## Раздел 6 — Рефакторинг: ~2/5

- 6.1: общее, без конкретных дублей
- 6.2: `saveKodikMaterial` не «300+ строк» как заявлено; главный God-component — `AnimeWatchPanel.tsx`
- 6.3: размеры cover `300/600` и «1000 мс в KodikPlayer» — **не подтверждено** как заявленные константы
- 6.4: `poster.ts` как главный silent-catch — слабый выбор vs `AnimeWatchPanel` / `useWatchParty`
- 6.5: `getShikimoriAuthUrl` / prop `isMobile` — **не подтверждено** как dead code

## Раздел 7 — Конвенции: ~4/5

В целом близко к `CONVENTIONS.md`. Слабо: alias описан как `@/lib/` вместо `@/* → src/*`; `"use server"` как общий паттерн преувеличен.

## Раздел 8 — Документация: ~3/5

- Для bookmarks лишние `docs/kodik-api` / `docs/shikimori-api`; не хватает `CODEBASE_MAP.md`
- При смене `/api/releases` `releases.ts` «ломается» неверно сформулировано (это источник, не consumer)
- Prisma steps ок по направлению, но без `CODEBASE_MAP` / impact table

## Раздел 9 — Генерация кода: ~2/5

- 9.1: `"Unauthorized"` вместо русских строк; модель `userBookmark` vs существующий `UserAnimeBookmark`
- 9.2: поля `shikimori_id`, `poster`, `genres.contains` — не соответствуют schema (`shikimoriId`, `KodikMaterialGenre`)
- 9.3: query `?query=` вместо `?genre=` / `buildSearchHref`; blue Tailwind не в стиле тёмной темы
- 9.4: rate limiter некорректен (счётчик в замыкании + `setTimeout` reset; несовместим с serverless)
- 9.5: schema ок как черновик, но без indexes/unique; не отмечено пересечение с `UserAnimeBookmark`

## Раздел 10 — Edge cases: ~2/5

- 10.1: **выдуман** on-demand sync при открытии страницы; реально `getAnimePageData` → Shikimori fetch/cache, иначе `notFound()`
- 10.2: last-write-wins по смыслу ок, но путь API неверный
- 10.3: retry/`KodikSyncLog` — **не подтверждено**; sync пишет error в `KodikSyncRun` и rethrow
- 10.4: **неверно** — после истечения сессии PUT даёт 401, новые сохранения не пишутся
- 10.5: передача мастера по сути верна, но без ссылки на `watch-party-server.mjs`

---

## Главный паттерн ошибок

Модель часто:
1. **выдумывает правдоподобные пути** (`src/lib/sync/...`, `middleware.ts`, `anime-op-ed.ts`);
2. **путает docs-инварианты с реализацией**;
3. **не цитирует строки**, хотя промт требовал;
4. почти не пишет `ФАЙЛ НЕ НАЙДЕН` / `НЕДОСТАТОЧНО ДАННЫХ` / `НЕ ПОДТВЕРЖДЕНО`.

## Что засчитать как сильные места

- Доменный ключ и идея `KodikMaterial` = озвучка
- Понимание, что progress не per-translation
- Верный OAuth callback path
- Верный cover route
- Интуиция про отсутствие rate limit на search и race на upsert
- Частично верные conventions

## Рекомендация по оценке локальной модели

Для этого прогона: **слабо / ниже среднего (~38%)**.  
Не использовать как «знающую кодовую базу» без обязательной сверки каждого пути с репозиторием.

Docs: not needed (оценка только в `test/results/EVALUATION.md`).
