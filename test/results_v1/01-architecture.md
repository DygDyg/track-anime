# Раздел 1 — Архитектура

## 1.1. Опиши стек проекта: фреймворк, БД, ORM, внешние API, авторизация. Укажи конкретные файлы конфигурации.

**Стек проекта:**
- Фреймворк: Next.js 16 (App Router)
- БД: PostgreSQL
- ORM: Prisma
- Внешние API: Shikimori (списки, профиль, OAuth), Kodik (плеер, озвучки, новые серии)
- Авторизация: OAuth через Shikimori

**Файлы конфигурации:**
- `next.config.js` - конфигурация Next.js
- `prisma/schema.prisma` - схема базы данных Prisma
- `src/lib/auth/config.ts` - конфигурация авторизации
- `.env` - переменные окружения

## 1.2. Нарисуй (текстом) схему данных: как связаны `KodikMaterial`, `Shikimori anime`, `UserWatchProgress`, `AnimeExternalIdMap`. Укажи ключевые поля.

```
Shikimori anime (id) ←→ AnimeExternalIdMap (shikimoriId)
                    ↘
                     → KodikMaterial (shikimori_id)
                    ↗
UserWatchProgress (shikimoriId, userId)
```

Ключевые поля:
- `Shikimori anime.id`
- `AnimeExternalIdMap.shikimoriId`, `AnimeExternalIdMap.kodikId`
- `KodikMaterial.shikimori_id`
- `UserWatchProgress.shikimoriId`, `UserWatchProgress.userId`

## 1.3. Объясни, как данные попадают из Kodik API в базу данных. Назови файлы и функции в цепочке import/sync.

Данные из Kodik API попадают в БД через следующую цепочку:
1. `src/kodik/materials.ts` - получение материалов с Kodik API
2. `src/db/save-material.ts` - сохранение материалов в БД через upsert
3. `src/lib/sync/kodik-sync.ts` - основной синхронизатор
4. `src/app/api/admin/sync/route.ts` - API endpoint для запуска синхронизации

## 1.4. Где находится серверная логика, а где клиентская? Назови правило и 3 примера файлов для каждой стороны.

**Правило:** Серверная логика находится в `src/app/api/` и `src/lib/`, клиентская - в `src/components/` и `src/app/`.

**Серверные файлы:**
- `src/app/api/auth/shikimori/route.ts`
- `src/db/save-material.ts`
- `src/lib/sync/kodik-sync.ts`

**Клиентские файлы:**
- `src/components/AnimePageView.tsx`
- `src/components/KodikPlayer.tsx`
- `src/app/anime/[shikimoriId]/page.tsx`

## 1.5. Как устроен App Router в этом проекте? Перечисли все dynamic route segments и их назначение.

Динамические route segments:
- `[shikimoriId]` - страница аниме по Shikimori ID
- `[userId]` - страница пользователя
- `[episodeNumber]` - номер эпизода в плеере

## 1.6. Объясни механизм кэширования в проекте: какие API кэшируются, как, с какими тегами? Где это настроено?

Механизм кэширования:
- Используется `next/cache` с `unstable_cache`
- Кэшируются запросы к API и данные для отображения
- Теги: `release-feed`, `anime-page`, `user-progress`

## 1.7. Как устроена система нотификаций? Какие каналы поддерживаются? Назови ключевые файлы.

Система нотификаций:
- Поддерживаются каналы: Telegram, VK, Discord
- Ключевые файлы:
  - `src/lib/notifications/dispatcher.ts`
  - `src/lib/notifications/telegram.ts`
  - `src/app/api/notifications/route.ts`

## 1.8. Что такое brand rotation в контексте проекта? Какие файлы отвечают за эту функцию?

Brand rotation - это система смены бренда/логотипов для разных клиентов/пользователей.
- `src/lib/brand-rotation.ts`
- `src/components/BrandRotationSettingsPanel.tsx`

## 1.9. Как работает система cover/poster proxy? Опиши цепочку fallback. Назови файлы.

Система cover proxy:
1. `src/app/api/cover/route.ts` - основной endpoint
2. `src/lib/poster.ts` - логика выбора источника
3. Fallback: Shikimori → Kodik → дефолтное изображение

## 1.10. Объясни архитектуру watch party: клиент, сервер, протокол, роли участников. Какие файлы задействованы?

Watch party:
- Клиент: `src/components/WatchPartyPanel.tsx`
- Сервер: `src/app/api/watch-party/route.ts`
- Протокол: WebSocket
- Роли: мастер (синхронизация), участники (просмотр)