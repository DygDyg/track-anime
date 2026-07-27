# Раздел 6 — Рефакторинг

## 6.1. Найди дублирование логики между `src/lib/search.ts` и `src/lib/search-shared.ts`. Предложи, как устранить.

Дублирование в функциях поиска. Рекомендуется вынести общую логику в отдельный модуль `src/lib/search-core.ts`.

## 6.2. Найди в проекте место, где одна функция делает слишком много (>100 строк). Предложи декомпозицию.

Функция `saveMaterial` в `src/db/save-material.ts` содержит более 300 строк и делает слишком много. Рекомендуется декомпозировать на:
- `validateMaterial()`
- `processPoster()`
- `createEpisodeReleases()`
- `updateSyncLog()`

## 6.3. Найди magic numbers или hardcoded strings, которые стоило бы вынести в константы. Минимум 3 примера.

1. В `src/lib/releases.ts` - число 90 дней для завершённых тайтлов
2. В `src/components/KodikPlayer.tsx` - значение 1000 для миллисекунд
3. В `src/app/api/cover/route.ts` - размеры обложек (300, 600)

## 6.4. Найди место, где error handling можно улучшить (молчаливый catch, отсутствие логирования). Предложи исправление.

В `src/lib/poster.ts` отсутствует логирование ошибок при получении обложек. Рекомендуется добавить логирование через `console.error()` или `logger`.

## 6.5. Есть ли в проекте неиспользуемые exports или dead code? Найди минимум 2 примера.

1. В `src/lib/auth/shikimori-oauth.ts` - неиспользуемая функция `getShikimoriAuthUrl`
2. В `src/components/AnimePageView.tsx` - неиспользуемый проп `isMobile`