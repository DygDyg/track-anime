# Track Anime — Business Logic

## Domain Key

```
Shikimori anime.id  ===  Kodik shikimori_id  ===  URL /anime/[shikimoriId]
```

Один Shikimori-тайтл может иметь несколько `KodikMaterial` (разные озвучки). Каждый material — отдельная запись с `translationId`, `translationTitle`, `playerLink`.

## Core Business Flows

### 1. Home Feed (новые серии)

**Источник:** `KodikEpisodeRelease` — создаётся при sync/import когда обнаружена новая серия.

**Flow:**
1. `getRecentReleasesPage()` — cursor pagination, sort by `releasedAt DESC`
2. Для авторизованных: `getHistoryNewEpisodes()` — серии из тайтлов в watch history, которых нет в основной ленте
3. `ReleaseFeed` (client) — infinite scroll через `GET /api/releases`
4. Фильтр по озвучкам из site settings пользователя

**Пустая лента:** нет данных → подсказка запустить `npm run kodik:sync`.

### 2. Anime Page + Player

**Flow:**
1. `getAnimePageData(shikimoriId)` загружает:
   - Shikimori metadata (title, description, score, relations)
   - Kodik translations из БД (все озвучки для shikimoriId)
   - Poster через цепочку fallback
2. Пользователь выбирает озвучку → `AnimeWatchPanel` загружает watch history
3. `KodikPlayer` встраивает iframe, слушает postMessage events
4. Прогресс сохраняется: season, episode, positionSeconds → `UserWatchProgress`

**Правило:** один прогресс на `(userId, shikimoriId)` — не на material/translation.

### 3. Authentication

**Flow:**
1. Login → `/api/auth/shikimori` → Shikimori OAuth
2. Callback → upsert `User` (по `shikimoriId`), save tokens в `ShikimoriAccount`
3. Admin: `ADMIN_SHIKIMORI_IDS` env или `User.isAdmin = true`
4. Session cookie `ta.session` → `Session` row, 30 дней

**OAuth state:** cookie + fallback `OAuthState` table (если cookies потерялись между редиректами).

### 4. Anime Lists (Shikimori sync)

**Local-first pattern:**
1. При входе / ручном sync: pull `user_rates` + `favourites` с Shikimori
2. Сохранение в `UserAnimeListEntry`, `UserAnimeBookmark`
3. Мутации на сайте: PUT `/api/user/anime-lists/[shikimoriId]` → обновление Shikimori API + локальный кэш
4. Метаданные sync в `UserListSync` (lastSyncedAt, errors)

**List statuses:** planned, watching, completed, on_hold, dropped, rewatching (Shikimori user_rates).

### 5. Watch History

**Модель:** `UserWatchProgress` — unique `(userId, shikimoriId)`.

**Поля:** `kodikId`, `seasonNumber`, `episodeNumber`, `positionSeconds`.

**Использование:**
- Страница `/history` — список с постерами
- Home block — новые серии из истории
- Anime page — восстановление позиции при открытии

### 6. Kodik Import

**Двухфазный импорт (`KodikImportJob`, id=`"full"`):**

| Phase | Action |
|-------|--------|
| `catalog` | Paginate Kodik `/list` (anime-serial, has shikimori_id) → save materials |
| `episodes` | For `episodesLoaded=false`: fetch with episodes → save seasons/episodes |

**Resume:** job state в БД, `--resume` flag в CLI.

### 7. Kodik Sync (incremental)

**Flow:**
1. Fetch N pages of recently updated materials (`KodikSyncSettings.syncPages`)
2. Update existing, add new materials
3. Detect new episodes → create `KodikEpisodeRelease`
4. Log run in `KodikSyncRun`
5. Auto-sync: `kodik-sync-scheduler.ts` по интервалу (`intervalMinutes`)

### 8. Search

**Источник:** локальная БД `KodikMaterial` (raw SQL в `search.ts`).

**Не ищет** напрямую в Shikimori/Kodik API — только по импортированным данным.

### 9. Cover/Poster Resolution

**Цепочка fallback (`poster-fallback.ts`):**
1. Kodik materialData poster
2. Shikimori anime image (API + cache)
3. World-Art link parsing
4. Related anime poster
5. Placeholder

**Кэш:** `/api/cover` — resize через sharp, disk cache, настройки в `CoverCacheSettings`.

## Critical Logic Rules

| Rule | Detail |
|------|--------|
| Frontend isolation | Клиент не вызывает Shikimori/Kodik API напрямую |
| Material uniqueness | `KodikMaterial.kodikId` — primary key, one per translation |
| Episode uniqueness | `@@unique([materialId, seasonNumber, episodeNumber])` |
| Release uniqueness | `@@unique([materialId, seasonNumber, episodeNumber])` в releases |
| Session validation | Каждый protected route вызывает `getSession()` independently |
| Admin guard | `requireAdmin()` для pages, `requireAdminApi()` для API |
| Shikimori rate limit | Все Shikimori запросы через shared rate limiter |
| Token refresh | `auth-client.ts` auto-refresh при 401 |

## Edge Cases

- **Нет Kodik данных для shikimoriId:** anime page показывает Shikimori metadata, плеер недоступен
- **Несколько озвучек:** пользователь выбирает в `AnimeWatchPanel`, фильтр в site settings
- **OAuth redirect mismatch:** `AUTH_URL` и `SHIKIMORI_REDIRECT_URI` должны совпадать с Shikimori app settings
- **Import interrupted:** resume через `npm run kodik:import:resume`
- **Empty feed after deploy:** нужен initial import (`kodik:import`) + sync (`kodik:sync`)
