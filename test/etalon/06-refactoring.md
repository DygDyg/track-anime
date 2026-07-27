## 6.1
Дублирование в search:
- `parseGenreList()` вызывается повторно для одного и того же input в `src/lib/search.ts:506-507`, а также жанры сериализуются/парсятся в нескольких местах `719`, `760-761`, `916`.
- Утилиты уже вынесены в `src/lib/search-shared.ts` и `src/lib/search-fields.ts`, но orchestration в `search.ts` остаётся размазанной.
Проблема: лишние повторные parse/serialize и дублирование нормализации query/genre flow между quick/advanced ветками.
Минимальный рефакторинг: ввести внутри `search.ts` маленький helper `normalizeGenreFilters(genresParam)` и переиспользовать результат вместо повторного `parseGenreList(filters.genre)`.

## 6.2
Слишком большая единица:
- `src/components/anime/AnimeWatchPanel.tsx` — файл очень большой, только по поиску содержит десятки функций/обработчиков; один `handleRoomPlayerEnded` уже начинается на `1822`, а рендер плеера идёт далеко за `2700`.
Проблема: один компонент совмещает player UI, progress save, AniSkip, Discord presence, watch party, fullscreen/motion controls.
Декомпозиция:
- `useAnimePlayerProgress`
- `useAnimeSkipTimes`
- `useAnimeWatchPartyBridge`
- `WatchPartyPanel`
- `SkipTimesDiagnostics`

## 6.3
Magic numbers / hardcoded constants, которые можно лучше централизовать:
- `MAX_CONCURRENT_PUBLIC_SEARCHES = 4` — `src/lib/search-protection.ts:3`.
- `QR_LOGIN_TTL_MS = 3 * 60 * 1000` — `src/lib/auth/qr-login.ts:5`.
- `MAX_ATTEMPTS = 5` — `src/lib/notifications/worker.ts:8`.
- `STALE_BROWSER_CACHE_SEC = 60` — `src/app/api/cover/route.ts:24`.
- `CONTINUE_HARD_TIMEOUT_MS = 15_000` — `src/components/anime/KodikPlayer.tsx:59`.
Минимальный рефакторинг: для каждого домена держать `const` в отдельном `*-constants.ts` или в верхней части профильного модуля с явными комментариями по бизнес-смыслу.

## 6.4
Error handling можно улучшить в местах с молчаливыми `catch`.
- `src/components/anime/AnimeWatchPanel.tsx` содержит несколько пустых `catch` блоков — строки по поиску: `172`, `496`, `577`, `1414`, `1468`, `1498`.
- `src/hooks/useWatchParty.ts` тоже молча глотает ошибки localStorage и fetch settings — `55-75`, `201-203`.
Проблема: сложно диагностировать реальные сбои в проде.
Минимальный фикс: логировать хотя бы `console.warn` с доменным префиксом там, где ошибка не ожидаема, а для truly-optional операций оставить комментарий почему она игнорируется.

## 6.5
Потенциальный dead code / unused exports:
- `getRecentReleases()` экспортируется из `src/lib/releases.ts:563-567`, но поиск usage в `src/` показал только сам файл.
- `preferOriginalShikimoriImageUrl()` экспортируется из `src/lib/poster.ts:44-58`, но поиск usage показал только сам `poster.ts`.
Это кандидаты на удаление или документирование, если используются только вручную/будущим кодом.
Дополнительно: параметр `secure` у `sessionCookieOptions(token, secure = ...)` не используется внутри функции — `src/lib/auth/session.ts:82-91`, хотя вызовы передают его из `local-login` и `qr/claim`.
