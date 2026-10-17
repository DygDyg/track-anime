# Раздел 6 — Рефакторинг

## 6.1. Дублирование `search.ts` ↔ `search-shared.ts`

**Текущее:**
- `search-shared.ts` — константы, `SearchResult`, `escapeIlikePattern`, `buildSearchHref`
- `search.ts` 11–19 imports + 48–58 **re-exports** тех же символов (barrel duplication)
- Почти тот же `GENRES_JSON` дублируется в `search-suggest.ts` ~43–50 vs `search.ts` ~60–67

**Проблема:** два источника правды для genres expression и лишний re-export слой.

**Предложение:**
1. Перенести `GENRES_JSON` в `search-shared.ts` (или `search-sql-fragments.ts`)
2. Импортировать из shared и в `search.ts`, и в `search-suggest.ts`
3. Re-exports в `search.ts` оставить только если нужны для public API; иначе импортеры пусть берут из `search-shared`

## 6.2. Функция >100 строк

**Кандидат:** `AnimeWatchPanel.tsx` — файл и отдельные handlers (continue-flow, end-guard, skip, watch party) существенно >100 строк.

Менее рискованный для декомпозиции пример: `getAnimePageData` / крупные SQL builders в `search.ts` (`fetchSearchRows`, advanced filters).

**Предложение для player:**
- Вынести `usePlayerContinueFlow`, `useAutoSkipOpEd`, `useWatchPartyEndGuard` в hooks рядом с `useWatchParty.ts`
- Оставить в панели wiring props/events

## 6.3. Magic numbers / hardcoded strings (≥3)

| Значение | Где | Предложение |
|----------|-----|-------------|
| `90` дней | `releases.ts` 165 — уже константа `COMPLETED_SERIES_MAX_AGE_DAYS`, но в SQL всё ещё литерал `INTERVAL '90 days'` (~200, ~456) | Подставлять ту же константу в SQL (template) |
| `1.25` | `WATCH_PARTY_END_GUARD_SECONDS` в `AnimeWatchPanel.tsx` 198 — имя про party, используется и solo | Переименовать в `EPISODE_END_GUARD_SECONDS` |
| `2500` | `PLAYER_CONTROLS_IDLE_MS_*` в `site-settings.ts` | Уже константы — ок; документировать в BUSINESS_LOGIC |
| Session sliding `90` дней | `session.ts` | Named export `SESSION_RENEW_THRESHOLD_DAYS` |

## 6.4. Error handling

**Текущее** (`AnimeWatchPanel.tsx` ~1033–1034):

```typescript
} catch {
  /* ignore network errors */
}
```

в `saveProgressNow` — сетевые ошибки и 401 глотаются; пользователь не знает, что прогресс не сохранился.

**Предложение:**

```typescript
} catch (error) {
  console.warn("[watch-history] save failed", error);
  // опционально: toast «Не удалось сохранить прогресс» с throttle
}
```

Аналогично silent catches в `poster-fallback.ts` ~99–101 — хотя бы `console.debug` с source name.

## 6.5. Dead code / unused exports (≥2)

По статическому grep (dynamic import не проверялся):

1. **`getRecentReleases`** — `src/lib/releases.ts` ~598–603; внешних вызовов нет (используют `getRecentReleasesPage` / Live)
2. **`searchAnimes`** — `src/lib/search.ts` ~715+; API/pages используют `searchAnimesQuick` / advanced
3. **`searchAnimesByGenre`** — `src/lib/search.ts` ~1037–1044; только определение (обёртка над quick)

**Предложение:** удалить или пометить `@deprecated` и перевести единственных потребителей (если появятся) на page API.
