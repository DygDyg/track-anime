# Раздел 5 — Поиск багов

## 5.1
`src/lib/search.ts` — **SQL injection: НЕ ПОДТВЕРЖДЕНО** по текущему коду.

Как параметры попадают:
- Query/filters из `src/app/api/search/route.ts` → `searchAnimesQuick` / `Advanced` / `ByDescription`.
- SQL через **`prisma.$queryRaw\`...\``** (tagged template) — значения биндятся Prisma, не конкатенацией строк.
- Пользовательский текст для ILIKE проходит **`escapeIlikePattern()`** — `src/lib/search-shared.ts:34+`; использование в `search.ts` (напр. ~553, ~584, ~590, ~732).

Риск:
- `%` / `_` в LIKE без escape был бы wildcard-abuse; escape закрывает.
- Остаточный риск — только если кто-то перейдёт на `$queryRawUnsafe` + string concat (в releases есть `queryRawUnsafe` для cursor SQL — отдельно от search text).

**Фикс:** не требуется для SQLi; запретить Unsafe для user text; держать escape + tagged templates.

## 5.2
`src/lib/releases.ts` — cursor pagination.

Поведение:
- Фазы `releases` | `catalog` — `ReleasesCursor.phase` ~71, `resolveFeedPhase` ~136-138.
- Когда releases исчерпаны, код всё равно может вернуть **`hasMore: true`** и `nextCursor: { phase: "catalog", ... }` — ~581-582 — даже без проверки, что catalog не пуст.

**Бесконечный цикл по title/orderBy: НЕ ПОДТВЕРЖДЕНО** (нет `orderBy: { title: "asc" }` pagination bug из «выдуманного» findMany).

**Реальная проблема:** лишний client round-trip (пустой catalog page). Дубли режутся cursor `(releasedAt, id)` + phase; merge на клиенте в `ReleaseFeed`.

**Фикс:** перед принудительным `hasMore: true` peek catalog count, или документировать two-phase contract.

## 5.3
`src/lib/poster.ts` + `/api/cover`:
- `resolvePosterUrl` при `shikimoriId` всегда отдаёт proxy URL; без id может вернуть `null` — `poster.ts:24-33`.
- `resolvePosterDisplayUrl` (~108+) может вернуть `null`, если нет proxy/direct/fallback.
- `/api/cover` при полном промахе: **`404 Image not found`** — `route.ts:72`, `137`, `149`, …

**Статического default placeholder (например `/placeholder-poster.webp`) как last resort — нет.**

**Риск:** пустая/битая картинка в UI.  
**Фикс:** local placeholder asset + final fallback в route/display helper.

## 5.4
`src/app/api/search/route.ts`:
- Публичный GET, сразу вызывает search — route ~13-35.
- **Per-IP / per-session rate limit в route — нет.**
- Есть только **concurrency pool** `withPublicSearchSlot` — `src/lib/search-protection.ts` (`MAX_CONCURRENT_PUBLIC_SEARCHES`), вызывается из search wrappers (~1092 area).

**Риск:** flood запросов (CPU/DB); pool защищает pool PG, не abuse.  
**Фикс:** IP/session rate limiter (см. 9.4) на `/api/search` и suggest.

## 5.5
`src/db/save-material.ts` — race при параллельном upsert одного material:
- `saveKodikMaterial` (~110): read previous → upsert material → `saveSeasonsAndEpisodes` (~231) с findUnique+create/update эпизодов (~287) → `trackLatestRelease` (~326) create release (~354).
- Unique на release/episode: `@@unique([materialId, seasonNumber, episodeNumber])` — schema ~368, ~388.
- При двух workers: unique violation / lost update / double work.

**Фикс:** serialize per `kodikId` (advisory lock / queue), idempotent `upsert`/`skipDuplicates`, catch P2002.
