## 5.1
`src/lib/search.ts` — явный SQL injection по текущему коду `НЕ ПОДТВЕРЖДЕНО`.
- raw SQL вызывается через `prisma.$queryRaw` template tags, а не через строковую конкатенацию — `src/lib/search.ts:188,328,345`.
- Дополнительно есть `escapeIlikePattern()` в `src/lib/search-shared.ts:30-32`.
- Риск остаётся только если где-то дальше пользовательские куски вставляются как raw SQL fragments; в просмотренном фрагменте такого не найдено.
Фикс: не нужен; сохранить только tagged templates и не переходить на `$queryRawUnsafe`.

## 5.2
`src/lib/releases.ts` — потенциально лишний round-trip в cursor pagination.
- В фазе `releases`, когда свежих rows уже нет, функция всё равно возвращает `hasMore: true` и переводит курсор в `catalog` — `src/lib/releases.ts:544-548`.
- Это не ломает данные, но клиент почти гарантированно сделает ещё один запрос даже если catalog тоже пуст.
Предложение фикса: проверять наличие catalog rows перед принудительным `hasMore: true`, либо явно документировать двухфазный cursor contract.

## 5.3
`src/lib/poster.ts` / `/api/cover` — нет подтверждённого статического fallback-изображения.
- `resolvePosterDisplayUrl()` возвращает `null`, если нет ни proxy, ни direct, ни fallback URL — `src/lib/poster.ts:102-130`.
- `/api/cover` при полном промахе возвращает `404 Image not found` — `src/app/api/cover/route.ts:72,137,149,156,199-203`.
Риск: UI может получить пустую обложку вместо гарантированного placeholder.
Фикс: добавить стабильный local placeholder (`/placeholder-poster.webp`) как последний fallback.

## 5.4
`src/app/api/search/route.ts` — нет rate limiting / abuse protection на уровне запроса.
- Route принимает публичные параметры и сразу вызывает поиск — `src/app/api/search/route.ts:13-53`.
- Есть только ограничитель concurrency pool на сервере `withPublicSearchSlot()` — `src/lib/search-protection.ts:3-31`, используется из `src/lib/search.ts:902`.
Риск: один клиент может flood-ить endpoint частыми запросами; concurrency cap защищает connection pool, но не делает per-IP throttling.
Фикс: добавить IP/session-based rate limiter для `/api/search` и `/api/search/suggest`.

## 5.5
`src/db/save-material.ts` — возможны race conditions при параллельном sync одного материала.
- Код читает previous state (`findUnique`) отдельно, затем делает `upsert`, потом отдельно пишет release/episodes — `src/db/save-material.ts:82-90,90-176`.
- Сохранение эпизодов делает `findUnique` + `create/update`, а не единый `upsert`, что оставляет окно для гонки между двумя concurrent workers — `src/db/save-material.ts:220-247`.
- `KodikEpisodeRelease` защищён unique constraint `@@unique([materialId, seasonNumber, episodeNumber])` — `prisma/schema.prisma:270` — но это означает, что при гонке возможен unique violation, если он не перехвачен выше.
Фикс: либо сериализовать sync по `kodikId`, либо перевести episode/release writes на idempotent upsert/skipDuplicates с обработкой unique conflict.
