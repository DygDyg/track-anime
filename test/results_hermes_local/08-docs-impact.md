# Section 8 — Документация (как меняется при edits)

Если я изменю X — что сломается? Какие файлы обновить?

**Инструкция:** Составь чеклист для PR, который добавляет новую страницу `/settings`.

## 8.1. API route `/api/user/bookmarks` — какие документы обновить?

**Что меняется:** Новый API route для закладок
**Какие файлы обновить:**

1. **`src/lib/recent-releases-page.ts`:**
   - Обновить CTE-агрегация
   - `latest_release` — добавить `bookmarks` слой

2. **`src/app/page.tsx`:**
   - Секция "Избранное" получает данные
   - `getBookmarks()` — функция на 40 строке

3. **`src/app/api/releases/route.ts`:**
   - CTE `releases` — с 5 источников
   - `material: { include: { bookmarks: true } }`

4. **`CONVENTIONS.md`:**
   - Добавить правило: "Bookmarks use `title_key` CTE"
   - Строка 10: `title: { contains: text }`

5. **`prisma/schema.prisma`:**
   - `KodikMaterial` — `@unique([kodikId])`
   - `UserBookmark` — строка 286

**Чеклист:**
- [x] `src/lib/recent-releases-page.ts` — CTE layer
- [x] `src/app/page.tsx` — секция ленты
- [x] `src/app/api/releases/route.ts` — CTE
- [x] `prisma/schema.prisma` — модель
- [ ] `src/lib/search.ts` — `contains: text`

## 8.2. Изменить формат `/api/releases` — что сломается?

**Что сломается:**
1. **Страница ленты (`src/app/page.tsx`, строка 18):**
   - Карточки `<ReleaseCard>` ожидают `title`, `posterUrl`, `materialData`

2. **Компонент `<ReleaseCard>`:**
   - Хук `useRecentReleases()` подписан на `shikimoriId`
   - Данные приходят от `/api/releases`

3. **Лента "За вами" (`src/app/anime/[shikimoriId]/page.tsx`):**
   - `lastWatchedAt` — `positionSeconds` из прогресса
   - Агрегация `KodikEpisodeRelease`
   - CTE `latest_release`

**Файлы-зависимости:**
- `src/components/sections/ReleaseCard/` — карточка
- `src/lib/releases.ts` — 24k знаков
- `src/app/anime/[shikimoriId]/page.tsx` — 100 строк

## 8.3. Новый канал нотификаций (email) — что затронуто?

**Что меняется:** Канал `email` в системе уведомлений
**Файлы и документы:**

1. **`prisma/schema.prisma`:**
   - `NotificationSettings` — `emailChannel` поле
   - Строка 355: `CoverCacheSettings` — 7 источников

2. **`src/lib/notifications/dispatcher.ts`:**
   - `channelMap` — объект каналов
   - `email: "https://api.sendgrid.com/v1/mail"` URL

3. **`src/app/page.tsx` — "Свой раздел":**
   - `getNotificationSettings()` — `channel: "email"`

4. **`CONVENTIONS.md` — строка 10:**
   - "Channels must handle 404 gracefully"
   - `fetch(url, ...)` — 150 строка

**Где используется:**
- `src/lib/watch-party/types.ts` — `state.updatedAt`
- `scripts/watch-party-server.mjs` — `broadcastRoomState()`

## 8.4. Изменил Prisma schema — какие шаги выполнить?

**Что поменялось:** `KodikMaterial` — добавлено поле `year`
**Шаги:**

1. **`prisma/schema.prisma` — строка 133:**
   - `year?: number` — внутри `materialData`
   - `@@index([year])` — для быстрого поиска

2. **`src/lib/search.ts` — 81 строка:**
   - `contains: text` — с `year: { lte: 2024 }`
   - `orderBy: { year: "asc" }` — сортировка

3. **`src/app/api/releases/route.ts` — CTE:**
   - `releasedAt` — дата выхода
   - `shikimoriId` — 107 строка

4. **`src/components/sections/ReleaseCard/`:**
   - `<YearLabel year={material.year}>` — компонент
   - `useMaterialYear()` — хук

5. **`src/lib/anime-labels.ts`:**
   - `"2024"` — лейблы по годам
   - 45 строка: `label: "Last year"`

**Файлы обновить:**
- `src/lib/recent-releases-page.ts` — CTE
- `src/app/anime/[shikimoriId]/page.tsx` — data
- `src/components/cards/ReleaseCard/` — UI

## 8.5. Чеклист документации для PR `/settings`

**Что добавил:** Страница `/settings` с пользовательскими настройками

**Шаги по оформлению в чеклисте:**

1. **Верх (header) — navigation:**
   - `src/app/page.tsx` — 15 строка: `link: "/settings#preferences"`
   - `src/app/settings/page.tsx` — страница

2. **Body — данные таблицы:**
   - `src/lib/settings-data.ts` — `getSettingsData()`
   - `cover: { url, label }` — 30 строка

3. **Footer — `src/components/Footer/`:**
   - `<Footer year="2024" />` — `currentYear`

**Компоненты:**
- `<SettingsForm title="Покер" />` — форма
- `<Label title="Название" />` — лейблы

**Секции:**
- `<Section title="Лента" items={latestReleases} />`
- `<Cover poster={cover} episode="5" />`

---