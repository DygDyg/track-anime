# Раздел 5 — Поиск багов

## 5.1. `src/lib/search.ts` — SQL injection

**Вердикт:** риск низкий при текущей реализации.

Параметры попадают через tagged templates `Prisma.sql` / `prisma.$queryRaw\`...\`` (например ~255, ~423, ~584). Значения параметризуются драйвером Prisma. Для ILIKE паттерны экранируются `escapeIlikePattern` (`search-shared.ts` 34–36).

`$queryRawUnsafe` в `search.ts` **не найден**.

**Потенциальный риск:** если когда-нибудь начнут конкатенировать user input в строку SQL вне `Prisma.sql` — тогда injection. Сейчас — нет.

**Фикс (профилактика):** запрет `$queryRawUnsafe` в lint/review; держать все фильтры в `Prisma.sql` fragments.

## 5.2. `releases.ts` — cursor pagination

**Корректность в целом:** да — cursor `(phase, releasedAt, id)`, phase handoff releases→catalog (~571–583).

**Риски:**
- На границе фаз клиент получает `hasMore: true` с пустым catalog cursor — это переход, не loop, если клиент корректно шлёт nextCursor.
- Дубли между фазами смягчены CTE исключения title_keys «свежих» релизов; тайтлы только со старыми (>90d) релизами **намеренно** могут появиться в catalog.
- Dedup в catalog через `seenIds` + batch limit (`CATALOG_QUERY_MAX_BATCHES`).

**Бесконечный цикл:** маловероятен при `hasMore:false` / `nextCursor:null` на конце. Риск — если клиент игнорирует cursor и всегда ходит initial page.

**Фикс (улучшение):** явно документировать phase transition в DTO; assert на клиенте `ReleaseFeed`, что cursor меняется.

## 5.3. `poster.ts` — все источники недоступны

`resolvePosterDisplayUrl` возвращает **`null`** (~136), если poster/direct/fallback невалидны.

`/api/cover` отвечает **404** `"Image not found"` (`cover/route.ts` ~72).

**Дефолтного placeholder-изображения** в `poster.ts` нет. UI (`AnimePoster` и др.) должен сам обрабатывать отсутствие URL (пустой img / skeleton) — иначе битая картинка.

**Фикс:** единый fallback URL (например `/logo.webp` или SVG placeholder) в `resolvePosterDisplayUrl` или в `AnimePoster` при `src == null`.

## 5.4. `/api/search` — rate limiting

Классического IP/user rate limit (429) на `src/app/api/search/route.ts` **нет** — только `Cache-Control` (~51–53).

Есть concurrency gate: `withPublicSearchSlot` (`search-protection.ts`, max 4 concurrent) — защита от исчерпания connection pool, не от abuse по RPS.

**Фикс:** добавить token-bucket / sliding window по IP (или Cloudflare/nginx) с 429; оставить slot gate как второй слой.

## 5.5. `save-material.ts` — race condition

`upsert` по PK `kodikId` (~136–180) безопасен от duplicate PK.

**Оставшиеся гонки:**
- Last-write-wins при параллельном sync двух процессов на один material.
- Genres: `deleteMany` + `createMany` в transaction (~194–200) — при двух параллельных upserts возможны кратковременные «пустые» genres или лишние delete/create, но не orphan PK.
- Seasons/episodes/releases: без advisory lock — теоретически двойное создание смягчается unique constraints (`@@unique` на episode/release).

**Фикс:** `SELECT … FOR UPDATE` / advisory lock по `kodikId` на время save; или очередь sync single-flight (`skipIfRunning` уже есть на уровне job в `kodik-sync.ts`).
