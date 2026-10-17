# Раздел 6 — Рефакторинг

## 6.1
Дублирование `search.ts` ↔ `search-shared.ts`:
- Shared уже содержит `escapeIlikePattern`, `buildSearchHref`, нормализацию query.
- В `search.ts` quick/advanced/description **повторяют** сбор ILIKE filters, genre parse, rank expressions (тысячи строк orchestration).

**Проблема:** повторный `parseGenreList` / сериализация жанров в нескольких ветках; сложнее менять ranking.

**Минимальный рефакторинг:**
```ts
// внутри search.ts
function normalizeGenreFilters(genresParam: string | string[] | undefined) {
  const list = parseGenreList(genresParam);
  return { list, keys: list.map(normalizeKodikGenreKey).filter(Boolean) };
}
// один вызов на request → переиспользовать в filter SQL builders
```
Вынести общие `addIlike(column, value)` builders уже частично есть (~581); расширить на advanced+quick без copy-paste rank CASE.

## 6.2
God-unit: **`src/components/anime/AnimeWatchPanel.tsx` (~4079 строк)**.

Совмещает: player UI, progress save, AniSkip/intro-offset, Discord presence, watch party bridge, episode navigation, lists/bookmarks UI.

**Декомпозиция:**
- `useAnimePlayerProgress` — save/load position, near-end
- `useAnimeSkipTimes` — fetch + applyIntroOffset
- `useAnimeWatchPartyBridge` — wrap `useWatchParty`
- `WatchPartyPanel` / `SkipTimesControls` — UI slices
- оставить panel как composition root

## 6.3
Magic numbers / strings → константы (уже частично const, но размазаны):

1. `COMPLETED_SERIES_MAX_AGE_DAYS = 90` — `releases.ts:165` (+ дубль SQL `INTERVAL '90 days'` ~200 — **рассинхрон риск**).
2. `MAX_CONCURRENT_PUBLIC_SEARCHES` — `search-protection.ts`.
3. `EPISODE_END_CANDIDATE_WINDOW_SECONDS = 20`, `WATCH_PARTY_END_GUARD_SECONDS = 1.25` — `AnimeWatchPanel.tsx:197-199`.
4. `STALE_BROWSER_CACHE_SEC = 60` — `api/cover/route.ts:24`.
5. `RELEASES_FEED_CACHE_SECONDS = 3600` — `releases.ts:166`.
6. QR TTL в `qr-login.ts`; `MAX_ATTEMPTS` notifications worker.

**Рефакторинг:** один `feed-constants.ts` / `player-constants.ts`; SQL interval строить из той же JS-константы.

## 6.4
Error handling:
- `AnimeWatchPanel` — `.catch(() => {})` и silent paths (напр. ~2362 и другие).
- `useWatchParty` — swallow localStorage/settings fetch errors.

**Проблема:** прод-диагностика «почему не сохранился progress / не подключилась room» слепая.

**Минимальный фикс:**
```ts
.catch((err) => {
  console.warn("[watch-progress]", err);
});
```
Для truly-optional — явный comment `// ignore: …`.

## 6.5
Кандидаты dead / low-use exports:
1. **`getRecentReleases`** — `src/lib/releases.ts:598` — usage в `src/` кроме собственного файла **не найден** (feed идёт через Page/Live).
2. **`preferOriginalShikimoriImageUrl`** — `src/lib/poster.ts:50` — usage только внутри `poster.ts` (нет внешних импортов).
3. Возможный unused param `secure` в session cookie helpers — проверить `session.ts` call sites.

**Действие:** удалить после `rg` CI check, либо пометить `@deprecated` / internal.
