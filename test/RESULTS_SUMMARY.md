# Track Anime — Тест (Hermes) — резюме

**Файл задания:** `test/LOCAL_MODEL_TEST_PROMPT.md`  
**Результаты:** `test/results/` (01–10 + `EVALUATION.md`)  
**Оценка:** **~92/100** (см. `test/results/EVALUATION.md`)  
**Объём:** ~48.5 КБ markdown

## Результаты

| Файл | Статус |
|------|--------|
| 01-architecture.md | ✅ |
| 02-invariants.md | ✅ |
| 03-business-logic.md | ✅ |
| 04-code-navigation.md | ✅ |
| 05-bug-hunt.md | ✅ |
| 06-refactoring.md | ✅ |
| 07-conventions.md | ✅ |
| 08-docs-impact.md | ✅ |
| 09-code-generation.md | ✅ |
| 10-edge-cases.md | ✅ |
| EVALUATION.md | ✅ |

## Ключевые факты (проверены по коду)

### Архитектура / инварианты
- Стек: Next.js 16 + React 19 + Prisma 6 + PostgreSQL; auth — Shikimori OAuth custom
- Доменный ключ: `Shikimori id === Kodik shikimori_id === /anime/[shikimoriId]`
- `UserWatchProgress` unique `(userId, shikimoriId)`; `KodikMaterial` = аниме + озвучка
- `src/proxy.ts` — legacy redirect only, не auth middleware

### Баги (раздел 5)
- SQL injection в search через `contains` — **НЕ ПОДТВЕРЖДЕНО** (`$queryRaw` + `escapeIlikePattern`)
- Cursor: лишний round-trip releases→catalog `hasMore: true`, не infinite `orderBy title`
- Cover: полный miss → **404**, нет static placeholder
- Search: concurrency slot есть, per-IP rate limit нет
- `save-material`: race при параллельном upsert

### Кодоген (раздел 9)
- Bookmarks API на существующей `UserAnimeBookmark` + `@/lib/prisma`
- `getAnimeByGenre` через `genres.some.genreKey`
- `GenreBadge` + `buildSearchHref`
- Rate limiter с 429 + предупреждение про дубль `UserBookmark` vs `UserAnimeBookmark`

## Ядра для изучения
1. `src/lib/search.ts` — raw SQL search  
2. `src/lib/releases.ts` — feed + 90 days  
3. `prisma/schema.prisma`  
4. `scripts/watch-party-server.mjs`  
5. `src/db/save-material.ts`  
6. `src/components/anime/AnimeWatchPanel.tsx`

## Сравнение прогонов

| Прогон | Балл |
|--------|------|
| hermes_local (Qwen) | ~35 |
| results_v1 | ~38 |
| **results (этот)** | **~92** |
