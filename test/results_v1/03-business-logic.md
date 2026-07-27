# Раздел 3 — Бизнес-логика

## 3.1. Опиши flow главной ленты (home feed): от данных в БД до рендера на клиенте. Назови все функции и компоненты.

Flow главной ленты:
1. `src/lib/releases.ts` - получение данных через `getRecentReleasesPage()`
2. `src/app/api/releases/route.ts` - API endpoint
3. `src/components/ReleaseFeed.tsx` - отображение ленты
4. `src/app/page.tsx` - главная страница

## 3.2. Как работает фильтр «завершённые тайтлы» в ленте? Где порог в 90 дней?

Фильтр завершённых тайтлов реализован через `isAnimeCompleted()` функцию в `src/lib/releases.ts`, порог 90 дней задаётся в `src/lib/anime-completion.ts`.

## 3.3. Опиши flow страницы аниме: что загружается, в каком порядке, какие компоненты рендерят что.

Flow страницы аниме:
1. `src/app/anime/[shikimoriId]/page.tsx` - главный компонент
2. `src/lib/anime-page-data.ts` - получение данных
3. `src/components/AnimePageView.tsx` - отображение информации
4. `src/components/KodikPlayer.tsx` - плеер

## 3.4. Как TA-плеер определяет, когда переключить на следующую серию? Почему «примерно за секунду до конца»?

Плеер проверяет позицию пользователя и при достижении конца эпизода (примерно за секунду) автоматически переключает на следующий.

## 3.5. Как работает автопропуск OP/ED? Откуда берутся тайминги? Что такое intro-offset?

Автопропуск OP/ED реализован через `src/lib/anime-op-ed.ts`. Тайминги берутся из Kodik API, intro-offset - смещение начала OP/ED.

## 3.6. Опиши механизм совместного просмотра (watch party): создание комнаты, подключение по ключу, синхронизация.

Механизм:
1. Создание комнаты через `src/app/api/watch-party/route.ts`
2. Подключение по ключу
3. Синхронизация через WebSocket

## 3.7. Как работает поиск? Какой движок используется? Укажи файл с SQL.

Поиск реализован через `src/lib/search.ts` с использованием SQL LIKE операторов и полнотекстового поиска.

## 3.8. Опиши flow OAuth-авторизации через Shikimori. Какие файлы участвуют?

1. `src/app/api/auth/shikimori/route.ts` - начальный запрос
2. `src/app/api/auth/callback/shikimori/route.ts` - обработка callback
3. `src/lib/auth/shikimori-oauth.ts` - работа с OAuth

## 3.9. Как работает QR-логин? Назови файлы и опиши flow.

QR-логин реализован через:
- `src/app/api/auth/qr/route.ts`
- `src/components/QRLoginPanel.tsx`
- Flow: генерация кода → сканирование → аутентификация

## 3.10. Что происходит при sync с Kodik? Как обнаруживаются новые серии? Где создаётся `KodikEpisodeRelease`?

При sync:
1. Запрашиваются материалы через Kodik API
2. Сравниваются с существующ��ми в БД
3. Новые серии создаются в `KodikEpisodeRelease` через `src/db/save-material.ts`