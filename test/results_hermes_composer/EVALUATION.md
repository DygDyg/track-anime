# Оценка теста Track Anime (Hermes + Grok Composer)

Сравнение с эталоном: `test/etalon/` + сверка с текущим кодом (08.10.2026).  
Прогон: файлы `01`–`10` в `test/results/` (mtime ~02:55–02:59).

## Итог: ~90/100

Лучший из прогонов Qwen/Hermes. Ответы близки к эталону, часто **точнее** устаревших номеров строк эталона (код вырос). Мало галлюцинаций, есть `НЕ ПОДТВЕРЖДЕНО` где нужно, раздел 9 в стиле репо.

| Критерий | Вес | Балл | Почему |
|----------|-----|------|--------|
| Корректность | 30% | **27/30** | Инварианты, цепочки, баги совпадают с кодом; мелкие оговорки/~строки |
| Полнота | 20% | **20/20** | Все 10 разделов, все вопросы |
| Конкретность | 20% | **17/20** | Реальные файлы, функции, строки; редкие «~» / чуть размытый 2.5#3 |
| Конвенции в коде | 15% | **14/15** | RU errors, `@/lib/prisma`, `UserAnimeBookmark`, GenreBadge+`buildSearchHref`, рабочий rate limit |
| Баги / рефакторинг | 15% | **14/15** | SQLi НЕ ПОДТВЕРЖДЕНО; two-phase cursor; placeholder; concurrency vs rate limit; race; AnimeWatchPanel |

---

## Сравнение прогонов

| Прогон | Среда | Оценка |
|--------|-------|--------|
| Qwen 3.5 stubs | Codex ChatGPT | ~16 |
| Qwen | `results_v1` | ~38 |
| Qwen 3.5 | Hermes ( alone ) | ~35 |
| **Grok Composer** | **Hermes** | **~90** |

---

## Раздел 1 — Архитектура: ~9/10

Совпадает с эталоном и кодом: стек, доменный ключ, `kodik/client` → import/sync → `saveKodikMaterial` / seasons / `trackLatestRelease`, server/client примеры (`AnimeWatchPanel`, `KodikPlayer`, `useWatchParty`), dynamic routes, cache tags `releases`, channels (+ **fcm** — верно для текущего `types.ts`), brand WEBP, cover chain до 404, watch-party master transfer.

Мелочи: «auth/config если присутствует» — излишняя оговорка; строки schema сдвинуты vs старый эталон, но **совпадают с текущим** `schema.prisma`.

## Раздел 2 — Инварианты: ~8/8

**2.1** правильное трёхчастное равенство + явное «не путать с kodikId».  
**2.2** токены/rate limit + `proxy.ts` не auth.  
**2.3–2.8** progress unique, admin guards, RU strings, material=озвучка, SyncRun/ImportJob, multi-material.

Слабо: третий пример в 2.5 чуть общий (без точной цитаты строки).

## Раздел 3 — Бизнес-логика: ~9.5/10

Сильнее эталона в **3.2**: найдена `COMPLETED_SERIES_MAX_AGE_DAYS = 90` в `releases.ts:165` (эталон писал `НЕДОСТАТОЧНО ДАННЫХ`).  
Верно: feed phases, AniSkip/skip-times/intro-offset, QR request/status/decision/claim, search `$queryRaw`+escape, OAuth `route.ts`, sync error/rethrow, near-end constants `20` / `1.25` в `AnimeWatchPanel`.

## Раздел 4 — Навигация: ~9.5/10

Сигнатура `getRecentReleasesPage(pageSize, cursor?)` **605-611** — верно.  
Cover `id=`, types `src/kodik/types.ts`, progress → watch-history → `upsertWatchProgress` **330+**, `proxy.ts` без auth, next.config без rewrites — всё совпадает.

## Раздел 5 — Баги: ~5/5

| # | Вердикт |
|---|---------|
| 5.1 | Верно: SQLi **НЕ ПОДТЕРЖДЕНО**; tagged `$queryRaw` + `escapeIlikePattern` (`search-shared.ts:34`) |
| 5.2 | Верно: `hasMore: true` → catalog (~581), лишний round-trip |
| 5.3 | Верно: нет static placeholder, cover 404 |
| 5.4 | Верно: нет per-IP limit; есть `withPublicSearchSlot` |
| 5.5 | Верно: read/upsert/episodes race + unique/P2002 |

## Раздел 6 — Рефакторинг: ~5/5

`parseGenreList` / search orchestration; **AnimeWatchPanel** god-component; magic numbers с риском рассинхрона SQL `INTERVAL '90 days'`; silent catch; dead `getRecentReleases` / `preferOriginalShikimoriImageUrl` — как эталон и лучше привязано к текущим строкам.

## Раздел 7 — Конвенции: ~5/5

kebab/PascalCase, `@/*`, API route patterns, server/client, docs impact. Честно отмечен camelCase hooks (`useWatchParty.ts`).

## Раздел 8 — Документация: ~5/5

Impact table для bookmarks/releases/email/schema/settings — в духе `CONVENTIONS.md`; правильные consumers `ReleaseFeed` / `ReleaseItem` / env для email.

## Раздел 9 — Генерация кода: ~4.5/5

- 9.1: использует **`userAnimeBookmark`**, RU `"Нужна авторизация"`, `@/lib/prisma` — лучше наивного эталона с несуществующим `label`.
- 9.2: `genres.some.genreKey` + `normalizeKodikGenreKey` + дедуп shikimoriId.
- 9.3: `Link` + `buildSearchHref`, тёмная тема.
- 9.4: module-level Map + 429 Retry-After; note про multi-instance.
- 9.5: отмечает дубль с `UserAnimeBookmark`, предлагает `note` на существующей модели.

## Раздел 10 — Edge cases: ~5/5

10.1 `anime-page.ts:435` + `notFound` — подтверждено.  
10.2 last-write-wins.  
10.3 error + rethrow, no internal retry.  
10.4 401 / потеря хвоста progress.  
10.5 `handleLeave` **262+**, master → `clients.keys().next()` **280** — точное совпадение с `watch-party-server.mjs`.

---

## Главный паттерн (успех)

1. Читает **реальные** файлы и обновлённые номера строк.
2. Отличает доменный ключ от `kodikId`.
3. Пишет `НЕ ПОДТВЕРЖДЕНО` вместо выдуманного SQLi.
4. Кодоген под существующую schema, не параллельную вселенную.
5. Почти нет выдуманных путей (`middleware.ts`, `components/player/`, …).

## Мелкие замечания (не критично)

- Иногда `~` вместо точного диапазона.
- 2.5: один пример без точной строки.
- Самооценки модели в папке не было — оценка только здесь.

## Рекомендация

**~90% — сильный / пригодный как «знающий кодовую базу»** при обычной code review.  
Для агентной работы по Track Anime этот прогон (Hermes + Grok Composer) заметно надёжнее чистого Qwen через Hermes/Codex.

Docs: обновление проектных docs не требуется (оценка только в `test/results/EVALUATION.md`).
