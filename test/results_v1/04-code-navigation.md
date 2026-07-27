# Раздел 4 — Навигация по коду

## 4.1. Где определена функция `getRecentReleasesPage`? Какие параметры она принимает?

Функция определена в `src/lib/releases.ts`, принимает параметры:
- `limit: number`
- `cursor?: string`
- `userId?: string`

## 4.2. Где обрабатывается OAuth callback от Shikimori?

Обрабатывается в `src/app/api/auth/callback/shikimori/route.ts`

## 4.3. Где находится Prisma schema? Перечисли 5 ключевых моделей и их назначение.

Prisma schema находится в `prisma/schema.prisma`
Ключевые модели:
1. `KodikMaterial` - материалы Kodik
2. `UserWatchProgress` - прогресс просмотра пользователей
3. `AnimeExternalIdMap` - сопоставление ID между источниками
4. `KodikSyncSettings` - настройки синхронизации
5. `User` - пользователи системы

## 4.4. Найди файл, который отвечает за проксирование обложек. Какой route обрабатывает запрос?

Файл: `src/app/api/cover/route.ts`
Route: `/api/cover`

## 4.5. Где определены типы Kodik API? Перечисли ключевые интерфейсы.

Файл: `src/kodik/types.ts`
Ключевые интерфейсы:
- `KodikTranslation`
- `KodikEpisodeValue` 
- `KodikSeason`
- `KodikMaterial`

## 4.6. Найди компонент TA-плеера. Какие хуки он использует?

Компонент: `src/components/KodikPlayer.tsx`
Использует хуки:
- `useEffect` для управления плеером
- `useState` для состояния плеера
- `useRef` для доступа к DOM элементам

## 4.7. Где находится логика сохранения watch progress? Проследи цепочку от клиента до БД.

Цепочка:
1. `src/components/KodikPlayer.tsx` - клиентская логика
2. `src/app/api/user/progress/route.ts` - API endpoint
3. `src/lib/user-progress.ts` - обработка данных
4. `prisma/UserWatchProgress` - сохранение в БД

## 4.8. Найди middleware проекта. Что он делает?

Файл: `src/middleware.ts`
Делает:
- Проверку сессии пользователя
- Перенаправление на login при отсутствии сессии
- Установку заголовков

## 4.9. Где определена функция `requireAdmin`? В каких файлах она вызывается (найди минимум 3)?

Функция определена в `src/lib/auth/admin.ts`
Вызывается в:
1. `src/app/api/admin/sync/route.ts`
2. `src/app/api/admin/settings/route.ts`
3. `src/app/api/admin/users/route.ts`

## 4.10. Найди конфиг Next.js. Какие rewrites/redirects настроены?

Файл: `next.config.js`
Настроены:
- Rewrites для API endpoint
- Redirects для старых URL