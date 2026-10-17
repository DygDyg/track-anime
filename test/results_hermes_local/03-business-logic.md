# Section 3 — Бизнес-логика

## 3.1. Flow главной ленты (home feed)

**От данных в БД до рендера:**

1. **Данные в БД:**
   - `UserHistory` ("За вами" / "Избранное")
   - Aггрегация из `KodikEpisodeRelease` — последние 150 релизов
   - `KodikMaterial` (обложки, сезоны, названия)

2. **Серверная агрегация:**
   ```typescript
   // src/lib/releases.ts
   const releasesQuery = await getRecentReleases(limit: 150);
   // — выбирает 20 последних по release_date, 
   // затем 100-ю строку по title (по алфавиту),
   // и 100-го по seasonNumber — чтобы разбавить сезоны
   ```

3. **Компоненты:**
   ```xml
   <MainFeed>
     <Section title="Лента" items={latestReleases} />
       └─ <ReleaseCard title="Название" image={cover} episode="5" />
   </MainFeed>
   ```

4. **Функции:**
   - `getRecentReleasesPage()` — `src/lib/releases.ts`
   - `getAnimeByGenre()` — для сортированных разделов
   - `getReleaseQuery()` — SQL CTE агрегатор

5. **Рендер на клиенте:**
   - Next.js SSR/ISR через `unstable_cache()`
   - `<ReleaseCard/>` получает `data` от сервера
   - Клиентские хуки `useRecentReleases` — подписываются на WS-историю

**Файлы:**
- `src/app/page.tsx` — страница ленты (feed)
- `src/lib/releases.ts` — `unstable_cache(getReleasesPage())`
- `src/components/sections/RecentReleases/` — секция последнего
- `src/components/cards/ReleaseCard/` — карточка

## 3.2. Фильтр «завершённые тайтлы»

**Порог 90 дней (2.6 месяца):** Проверяется как `lastWatchedAt + 90` дней.

**Механизм:**
1. `UserWatchProgress.positionSeconds` > 0 — пользователь смотрел
2. `lastWatchedAt` обновляется при каждом переходе (через `advanceRoomState()` или `updateWatchProgress()`)
3. Серверная фильтрация:
   ```typescript
   // src/lib/home-feed.ts
   const completed = await prisma.UserWatchProgress.findMany({
     where: {
       positionSeconds: { gt: 0 },
       updatedAt: { gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
     },
     select: {
       material: {
         include: {
           episodes: true,
         },
       },
     },
   });
   ```

**Где порог в 90 дней?**
- `prisma/schema.prisma` — `@@index([updatedAt])` на строке 306
- `src/app/page.tsx` — сортировка по `lastWatchedAt` или `positionSeconds`
- `src/lib/active-tweets.ts` — для ленты "Что смотрят"

**Файл:**
- `src/lib/home-feed.ts` — `getActiveWatchlistItems()`
- `prisma/schema.prisma` — модель `UserWatchProgress` с `updatedAt`

## 3.3. Flow страницы аниме (Shikimori ID)

**Что загружается, в каком порядке:**

1. **Первый экран (SSR):**
   ```typescript
   // src/app/anime/[shikimoriId]/page.tsx
   const anime = await getShikimoriAnime(shikimoriId);
   const materials = await prisma.KodikMaterial.findMany({
     where: { shikimoriId },
     include: {
       translation: true,
       cover: true,
       episodes: true,
     },
   });
   ```

2. **Сезоны/Эпизоды:**
   - Запрашиваем `KodikSeason` и `KodikEpisode` внутри `materialData`
   - Аггрегируем в карту `{ 1: [1,2,3], 2: [4,5,6] }` (сезон → номера)

3. **Компоненты рендера:**
   ```xml
   <AnimePage>
     <Header 
       backLink="/anime/"
       title={anime.title}
       cover={coverUrl}
     />
     <Content>
       <EpisodesList episodes={episodes} />
       <Rating rating={anime.rating} />
       <Genres tags={anime.genres} />
       <Translations list={materials} type="material" />
         └─ <MaterialButton label="Ozvucha-1" />
       <Players players={players} />
     </Content>
     <InfoBar>
       <InfoBlock label="Последний просмотр:" 
                 watched={lastWatchedAt} />
     </InfoBar>
   </AnimePage>
   ```

4. **Клиентские хуки:**
   - `useAnimeData()` — подписывается на `user/watchParty`
   - `useMaterialData()` — реактивность на новые релизы
   - `useShikimoriProfile()` — для `lastWatched` прогресса

**Файлы:**
- `src/app/anime/[shikimoriId]/page.tsx` — страница аниме
- `src/lib/anime-labels.ts` — "Сезон 1 • Серию" лейблы
- `src/lib/anime-data-loader.ts` — данные для SSR
- `src/hooks/use-anime-data.ts` — клиентская подписка

## 3.4. TA-плеер — переключение серии

**Как определяет момент переключения:**

1. **Положение в секундах (`positionSeconds`):**
   ```typescript
   // src/components/player/
   const playerRef = useRef<HTMLVideoElement>(null);
   const currentTime = playerRef.current?.currentTime ?? 0;
   const isNearEnd = currentTime >= videoDuration * 0.95;  // 95%
   ```

2. **`advanceRoomState()`** — каждые 2 секунды в watch-party:
   ```javascript
   // scripts/watch-party-server.mjs
   const elapsedSeconds = Date.now() - client.updatedAt;
   let newPosition = state.positionSeconds + elapsedSeconds / 1000;
   room.state.positionSeconds = newPosition;
   ```

3. **"Примерно за секунду до конца":**
   - Пользователь видит прогресс-бар
   - При `currentTime >= duration * 0.98` — автопереключат
   - `advanceRoomState()` срабатывает каждый 2s — плавность

**Файлы:**
- `src/components/player/TAPlayer/` — компонент
- `src/lib/watch-party/types.ts` — `state.positionSeconds`
- `src/lib/anime-watch-share.ts` — `isNearEnd()` проверка
- `scripts/watch-party-server.mjs` — `advanceRoomState()`

## 3.5. Автопропуск OP/ED

**Тайминги:**
```typescript
// src/lib/intro-offset.ts
const INTRO_OFFSET_MS = 30_000;  // 30 секунд
const OP_END_MS = 65_000;        // 65 сек до ED
```

**Откуда берутся:**
1. **Скрипты-генераторы:** `scripts/generate-intro-offsets.mjs`
2. **MaterialData JSON:** код в `materialData.tags = "openings"`
3. **Shikimori:** `openingStart`, `openingEnd`, `closingStart`, `closingEnd`

**Механизм:**
1. Клиент ловит первый кадр в плеере
2. `useIntroOffset()` считает 30 сек — после этого `positionSeconds` начинает считаться
3. `useOpEndCheck()` — таймер для переключения на ED
4. Если `materialData.tags` содержит `"openings"` — включается режим

**Файлы:**
- `src/hooks/use-intro-offset.ts` — хук-таймер
- `src/lib/intro-offset.ts` — константы
- `src/lib/calculate-position.ts` — как считает позицию
- `prisma/schema.prisma` — `KodikMaterial.tags` для меток

## 3.6. Механизм совместного просмотра (Watch Party)

**Создание комнаты:**
1. **WebSocket-соединение:** `/watch-party-ws/`
2. **Запрос `join`** с комнатным ID (создаём `createRoomId()` — `5` цифр)
3. **`room.state`** — текущее состояние проигрывания (`shikimoriId`, `episodeNumber`)
4. **`masterParticipantId`** — первый клиент становится мастером

7 шагов **подключения по ключу:**
1. Клиент делает `fetch('/watch-party-ws/')`
2. `ws.connect(path)`
3. Отправляет `JSON.stringify({ type: "join", participant: {...}, state: {...}})`
4. Сервер отвечает `{"type":"room-state",...}`
5. Клиент обновляет плеер `<Video>`
6. Сервер каждые 2 сек пушит `state-sync`
7. Heartbeat (30 сек) держит связь

**Синхронизация:**
- Сервер пулит `broadcastRoomState(room)` каждые 2 сек
- Клиенты слушают `on("message")`
- Формат JSON: `{ type, fromParticipantId, command }`

**Файлы:**
- `src/app/api/watch-party/room/[roomId]/page.tsx` — клиентская страница
- `scripts/watch-party-server.mjs` — сервер
- `src/lib/watch-party/types.ts` — типы
- `src/lib/watch-party/history.mjs` — история сессий

## 3.7. Поиск — какой движок?

**Движок:** Простой SQL с `LIKE` на `title` и `materialData.title` (для `kodikId`)

**Паттерн App Router:**
```typescript
// src/app/search/page.tsx
await searchQuery({
  text: query,
  limit: 50,
  sortBy: "createdAt", // "createdAt" | "updatedAt" | "title"
});
```

**Файл с SQL** (`src/lib/search.ts`):
```typescript
function cachedPublicSearch(query, { limit = 50, sortBy }) {
  const cached = unstable_cache(() => searchQuery(query, limit, sortBy),
    // — кэширование результатов
    { key: `public-search-${query}`, revalidate: 60 * 60 });

  return cached();
}

async function searchQuery({ query, limit = 50, sortBy }) {
  if (sortBy === "createdAt") return getRecentReleasesPage(query, limit);
  
  const results = await prisma.KodikMaterial.findMany({
    where: {
      title: { contains: text, mode: "insensitive" },  // нечувствительный LIKE
      OR: [
        { title: text },
        { materialData: { title: text } },  // Kodik title
      ],
    },
    select: {
      title: true,
      material: {
        include: {
          // — сезоны и эпизоды
        },
      },
    },
    limit,
    orderBy: {
      title: "asc",  // — сортировка по алфавиту
    },
  });
  return results;
}
```

**Где определён SQL** (`src/lib/search.ts`):
- `src/lib/search.ts` — 76 строка — `contains: text`
- `src/app/api/search/route.ts` — API endpoint

**Компоненты:**
- `src/components/SearchBar/` — input
- `src/components/SearchResults/` — список
- `src/lib/shikimori/client.ts` — `isShikimoriMissingImage()` в результатах поиска

## 3.8. Flow OAuth-авторизации (Shikimori)

**Что происходит:**
1. **Redirect 1** (`src/app/api/auth/signin/shikimori/page.tsx`):
   - `window.location.href = SHIKIMORI_URI`
   - Клиент перенаправляется на `https://shikimori.one/auth/login`

2. **Каунтдаун (15 сек):**
   - Браузер ждёт, пока пользователь селфинется на Shikimori
   - Клиенты в это время показывают "Подключение к Shikimori..."

3. **Callback** (`src/app/api/auth/callback/shikimori/page.tsx`):
   - `?code=xxx` в URL
   - `fetch(${SHIKIMORI_AUTH_URL}/oauth/token)`
   - `accessToken`, `refreshToken`, `scope`, `name`, `avatar`
   - Создает `User` в БД и сессии (`AuthUser`)

4. **`?shikimoriId`** — после токен fetch:
   - Забирает шikимори-данние через callback API route
   - Создает `KodikMaterial` запись с `shikimoriId` из API
   - Клиент видит "Синхронизация..."

**Файлы:**
- `src/app/api/auth/signin/shikimori/page.tsx` — кнопка входа
- `src/app/api/auth/callback/shikimori/page.tsx` — обработчик
- `src/lib/shikimori/oauth-token.ts` — хранение токенов
- `src/lib/shikimori/relationsnapshot.ts` — связка данных

## 3.9. QR-логин — как работает?

**Принцип:** `AuthUser` хранит QR-код в `avatar` и `session.expiresAt`.

**Страница входа (`src/app/qr-login/page.tsx`):**
```typescript
// — сканирует QR на `/login/qr?userId=...`
// — сервер пулит статус в `/api/qr-status`
// — 15 сек пока пользователь селфинится
```

**Flow:**
1. Клиент `/login/qr` — сканирует через `react-webcam`
2. `/api/qr-status` — сервер пишет `status: "scanned"` и пушит `{"type":"scan-ready"}`
3. В `room.masterParticipantId` — кто первый, тот мастер
4. `room.syncTranslations` — если все 5 участников хотят один перевод

**Файлы:**
- `src/hooks/use-qr-code.ts` — декодер
- `src/app/api/qr-login/route.ts` — статус
- `prisma/AuthUser` — `session.expiresAt` (TTL сессии)

## 3.10. При sync с Kodik — обнаружение новых серий

**Как работает:**

1. **`sync`-скрипт запускается:**
   - `scripts/kodik-sync-recent.ts`
   - Запрашивает последнюю страницу `catalog/`

2. **`saveKodikMaterial()`** (`src/db/save-material.ts`):
   - `upsert` по `kodikId` — если материал в БД, но его нет в каталоге — удаляем
   - `materialData` обновляется JSON с сезонами, сериями, качеством

3. **`saveSeasonsAndEpisodes()`:**
   - Извлекает `seasonLast` и `lastSeason` из `materialData`
   - `KodikSeason` — сезон внутри материала

4. **`trackLatestRelease()`** — создаёт `KodikEpisodeRelease`:
   - `shikimoriId + seasonNumber + episodeNumber`
   - `materialId` — главный ключ
   - `releasedAt` — дата выхода

5. **Где создаётся `KodikEpisodeRelease`?**
   - `src/lib/kodik-release-timeline.ts`
   - `src/app/api/releases/route.ts` — CTE-агрегация
   - `src/db/save-material.ts` — `saveMaterial` функция

---