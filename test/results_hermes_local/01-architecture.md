# Section 1 — Архитектура проекта

## 1.1. Стек проекта

- **Фреймворк:** Next.js 16 (App Router) — `package.json`, `next.config.ts`
- **БД:** PostgreSQL 16 — Prisma datasource config в `prisma/schema.prisma`
- **ORM:** Prisma 6 — `prisma/schema.prisma`, `@prisma/client`
- **Внешние API:**
  - Kodik API — `src/kodik/` directory, клиентские функции в `src/lib/kodik-*`
  - Shikimori API — `src/lib/shikimori/`, OAuth руты в `src/app/api/auth/`
- **Авторизация:** Shikimori OAuth2 (кастомная, без NextAuth) — `src/lib/auth/session.ts`, `src/app/api/auth/callback/shikimori`

Ключевые файлы конфигурации:
- `next.config.ts` — настройки Next.js
- `package.json` — зависимости и скрипты
- `prisma/schema.prisma` — схема БД и генератор клиента
- `.env.example` — переменные окружения (DATABASE_URL, KODIK_API_TOKEN, SHIKIMORI_CLIENT_ID, SHIKIMORI_CLIENT_SECRET, AUTH_URL)

## 1.2. Схема данных (текстом)

```
KodikMaterial (id=kodikId, shikimoriId?, title, translationId, translationTitle, translationType, materialData Json, episodesCount?, lastSeason?, lastEpisode?, episodesLoaded)
    └─ KodikSeason (id, materialId, seasonNumber, playerLink, episodes)
        └─ KodikEpisode (id, materialId, seasonNumber, episodeNumber, playerLink, title, screenshots?)
KodikEpisodeRelease (id, materialId, shikimoriId, seasonNumber, episodeNumber, translationName, animeTitle, posterUrl, playerLink, releasedAt)
    └─ linked to UserWatchProgress (userId, shikimoriId, kodikId, seasonNumber, episodeNumber, positionSeconds)

Shikimori anime (связь через shikimoriId)
    └─ связано с KodikMaterial через shikimoriId (??-по-одному, см. секция 2.8)
    └─ связано с UserWatchProgress через shikimoriId

UserWatchProgress (id, userId, shikimoriId, kodikId, seasonNumber, episodeNumber, positionSeconds, updatedAt)
    └─ уникальный ключ: (userId, shikimoriId) — не по translation

AnimeExternalIdMap (shikimoriId PK, malId, source, syncedAt)
```

Ключевые поля:
- `KodikMaterial.kodikId` — primary key, связь с Kodik API
- `KodikMaterial.shikimoriId` — внешняя связь с Shikimori (может быть null)
- `KodikMaterial.translationId` — идентификатор перевода
- `UserWatchProgress.userId + UserWatchProgress.shikimoriId` — составной уникальный ключ
- `KodikEpisodeRelease.shikimoriId + seasonNumber + episodeNumber` — уникальность релиза

## 1.3. Как данные попадают из Kodik API в БД

Цепочка import/sync:

1. **Kodik import** — `scripts/kodik-import-full.ts` (полный импорт) или `scripts/kodik-sync-recent.ts` (инкрементальный)
2. HTTP-запрос к Kodik API для получения каталога материалов
3. **`saveKodikMaterial()`** (`src/db/save-material.ts`) — upsert `KodikMaterial` записи, сохраняет `materialData Json`, жанры, сезоны и серии
4. **`saveSeasonsAndEpisodes()`** — создает/обновляет `KodikSeason` и `KodikEpisode` записи
5. **`trackLatestRelease()`** — создает `KodikEpisodeRelease` запись для последней серии, Dispatch уведомления `dispatchHistoryNewEpisodeRelease`
6. **`kodik:sync`** — периодический инкрементальный sync, проверяет новые релизы через `KodikEpisodeRelease`

Файлы/функции в цепочке:
- `scripts/kodik-import-full.ts` / `kodik-sync-recent.ts` — точки входа
- `src/db/save-material.ts` — `saveKodikMaterial()` — основная функция upsert
- `src/lib/admin/kodik-sync.ts` — админ-синк
- `src/lib/kodik-ensure-materials.ts` — обеспечивает наличие материалов

## 1.4. Серверная vs клиентская логика

**Правило:** Браузерный код НЕ может вызывать Shikimori/Kodik API напрямую. Все внешние API вызовы происходят с сервера (Next.js API routes или server-side функции).

**Серверная логика (server-only):**
- `src/lib/search.ts` — импортирует `server-only`, все функции работают на бэкенде
- `src/db/save-material.ts` — сохраняет данные Kodik в БД
- `src/lib/cover-cache.ts` — обслуживание обложек
- `src/lib/kodik-import-full.ts` — импорт данных

Примеры серверных файлов:
- `src/app/api/search/route.ts` — API route_GET
- `src/app/api/admin/import/pending-materials/route.ts` — админ API
- `src/lib/prisma.ts` — Prisma клиент (серверный сингл)

**Клиентская логика (use client):**
- React компоненты с `"use client"` директивой
- Хуки для fetch mutations
- Player интерфейс

Примеры клиентских файлов:
- `src/components/player/` — TA-плеер интерфейс
- `src/hooks/use-anime-data.ts` — (если есть)
- Страницы с `"use client"` для интерактивных элементов

## 1.5. App Router dynamic route segments

Next.js App Router использует dynamic segments в pathname:

- `src/app/anime/[shikimoriId]/page.tsx` — страница аниме по Shikimori ID
- `src/app/search/page.tsx` — страница поиска
- `src/app/anime/[shikimoriId]/players/[...path]/page.tsx` — плеер страницы
- `src/app/profile/[userId]/page.tsx` — страница профиля пользователя
- `src/app/api/[...]/route.ts` — динамические API роуты (универсальный паттерн)

Назначение:
- `[shikimoriId]` — динамический ID аниме из Shikimori, используется для построения ссылок на страницы
- `[...path]` — Catch-all маршрут для плеера
- `[userId]` — ID пользователя для публичных профилей

## 1.6. Механизм кэширования

- **unstable_cache** (Next.js) — используется в `src/lib/search.ts` для кэширования результатов поиска с тегами `["public-search"]` и ревалидацией every 60 секунд
- **unstable_cache** — также в `src/lib/releases.ts` для страницы recent-releases с `revalidate: 60 * 60` (1 час)
- **Cover cache** — настройка в `prisma/CoverCacheSettings` (максимум 7 дней, порядок источников: url, kodik, material_db, cvh, shikimori, worldart)
- **Browser cache** — `STALE_BROWSER_CACHE_SEC = 60` в `src/app/api/cover/route.ts`
- **Material poster resolution** — `src/lib/poster.ts` и `src/lib/material-poster.ts` — кэширование resolved poster URLs

Кэшируется:
- Результаты поиска (запрос-ответ пара)
- Страницы ленты релизов
- Обложки аниме (KodikMaterial → poster URL → cache on disk)
- Настройки cover cache (`src/lib/admin/cover-cache-settings.ts`)

Настроено в:
- `src/lib/search.ts` — `cachedPublicSearch()` с `unstable_cache`
- `src/lib/releases.ts` — `unstable_cache` с тегами `["releases"]`
- `prisma/schema.prisma` — `CoverCacheSettings` модель
- `src/app/api/cover/route.ts` — настройки browserCacheSec

## 1.7. Система нотификаций

Поддерживаемые каналы:
- **Browser Push** (Web Push VAPID) — `src/lib/notifications/`, `generate-vapid-keys.ts`
- **In-app фелдш** — лента новых серий, история просмотра
- **Telegram** — `tsx scripts/telegram-notification-bot.ts`
- **VK** — `tsx scripts/vk-notification-bot.ts`
- **Discord DM** — `tsx scripts/discord-rpc-bridge.mjs` и настройки в `NotificationSettings` модели
- **Email** — через внешние сервисы (конфигурируется в `.env`)

Ключевые файлы:
- `src/lib/notifications/dispatcher.ts` — диспетчер уведомлений
- `src/lib/notifications/channels/` — канальные реализации
- `prisma/NotificationSettings` — настройки пользователя
- `prisma/HistoryNewNotification` — история отправленных уведомлений
- `src/lib/notifications/worker.ts` — воркер доставки
- `src/lib/shikimori/relation-snapshot.ts` — изменения статуса триггерят нотификации

## 1.8. Brand rotation

**Что такое brand rotation:** Ротация бренд-логотипов на сайте. Логотипы хранятся в `public/brand-logos`, а настройка и порядок ротации — в БД модели `BrandRotationSettings`.

**Файлы, отвечающие за функцию:**
- `prisma/schema.prisma` — `BrandRotationSettings` модель (id, enabled, intervalMinutes=120, rotationSeed="default")
- `scripts/sync-brand-assets.mjs` — скрипт синхронизации бренд-активов
- `src/lib/brand-icons.ts` — получение иконок брендов
- `src/lib/brand-rotation.ts` — логика ротации (через intervalMinutes)
- `src/app-brand.ts` — отображение бренда на странице
- `site-brand.generated.ts` — сгенерированные бренд активы с хэшами версий

## 1.9. Система cover/poster proxy

**Цепочка fallback** для получения обложки аниме:

1. **Shikimori cover cache** (`/api/cover?id={shikimoriId}`) — проверяется первой, если есть кэшированная обложка
2. **Direct image URL** — если шikимориId нет или кэш пуст, пытаемся получить прямую ссылку
3. **Kodik material poster** — `resolveMaterialPosterUrl()` из `materialData`
4. **WorldArt poster** — `worldart_poster_url` из materialData
5. **Fallback изображение** — дефолтная обложка, если все источники недоступны

**Файлы:**
- `src/app/api/cover/route.ts` — главный endpoint `/api/cover`, обрабатывает все fallback-цепочки
- `src/lib/poster.ts` — `resolvePosterUrl()`, `resolveDirectPosterUrl()`, `pickThumbDirectUrl()`
- `src/lib/poster-fallback.ts` — цепочка fallback (см. конвенции)
- `src/lib/material-poster.ts` — `resolveMaterialPosterUrl()`, `buildMaterialPosterSource()`
- `src/lib/cover-cache.ts` — `resolveCoverSourceUrl()`, `resolveCoverSourceUrlQuick()`, настройки кэша
- `src/lib/shikimori/client.ts` — `isShikimoriMissingImage()` — проверка на "missing image"

## 1.10. Архитектура watch party

**Клиент:**
- Веб-интерфейс с WebSocket соединением
- Отправка команд play/pause/seek/episode/translation
- Получение `room-state` и обновление состояния плеера
- Участие в комнате с ником и аватаром

**Сервер:**
- `scripts/watch-party-server.mjs` — Node.js HTTP + WS сервер
- Порты: `WATCH_PARTY_PORT` (по умолчанию 3001)
- WS путь: `WATCH_PARTY_WS_PATH` (по умолчанию `/watch-party-ws`)
- Хранилище комнат в памяти `Map<roomId, roomState>`
- Heartbeat interval (30s) и state-sync interval (2s)

**Протокол:**
- Сообщения в JSON через WebSocket
- Протокол версия 2 (`WATCH_PARTY_PROTOCOL_VERSION`)
- Команды: `join`, `leave`, `play`, `pause`, `seek`, `episode`, `translation`, `state-sync`, `set-permissions`, `presence`
- С состоянием проигрывания: `shikimoriId`, `kodikId`, `seasonNumber`, `episodeNumber`, `positionSeconds`, `isPlaying`, `updatedAt`

**Роли участников:**
- **Мастер (master):** создатель комнаты, первый клиент, имеет особые права
- **Гости:** участники с ограниченными правами (по настройкам `allowParticipantControls`, `allowParticipantSeeking` и т.д.)
- Передача роли мастера: при отключении текущего мастера роль передаётся следующему клиенту в комнате

**Ключевые файлы:**
- `scripts/watch-party-server.mjs` — основной сервер
- `src/lib/watch-party/types.ts` — типовые определения
- `src/lib/watch-party/history.mjs` — история сессий
- `prisma/WatchPartySession`, `WatchPartySessionParticipant` — модели БД
- `src/app/api/watch-party/` — API роуты для создания комнат

---