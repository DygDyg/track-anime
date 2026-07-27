## 10.1
Если пользователь открывает аниме, которого нет в БД, но оно есть на Shikimori:
- `getAnimePageData()` пытается взять Shikimori cache/refresh/live fetch — `src/lib/anime-page.ts:407-413`.
- Если Shikimori данные нашлись, а локальных materials нет, функция не обязана вернуть `null`: `if (!anime && materials.length === 0) return null;` — `src/lib/anime-page.ts:416`.
- Значит страница может открыться с Shikimori metadata, но без playable translations.
- Если и Shikimori не дал данных, и materials пусты, page вызывает `notFound()` — `src/app/anime/[shikimoriId]/page.tsx:44-45`.

## 10.2
При просмотре одного аниме в двух вкладках:
- обе вкладки пишут в один и тот же ключ `(userId, shikimoriId)` — `src/lib/watch-history.ts:334-355`.
- Последняя запись победит (`last write wins`), потому что `kodikId`, `seasonNumber`, `episodeNumber`, `positionSeconds` просто обновляются.
- Отдельной multi-tab reconciliation в просмотренном коде я не нашёл.

## 10.3
Если Kodik API упадёт во время sync:
- `runKodikIncrementalSync()` ловит ошибку в общем `catch`, записывает `status: "error"` и `lastError/error`, затем rethrow — `src/lib/admin/kodik-sync.ts:193-223`.
- Явного retry/backoff в просмотренном коде нет.
- Автоматический повтор возможен только внешним scheduler/cron, но не внутри одного запуска sync. Внутренний retry: `НЕ ПОДТВЕРЖДЕНО`.

## 10.4
Если сессия истекла во время просмотра:
- `PUT /api/user/watch-history/[shikimoriId]` вернёт `401 "Нужна авторизация"` — `src/app/api/user/watch-history/[shikimoriId]/route.ts:33-37`.
- Уже воспроизводимое видео в iframe само по себе не обязано остановиться, но новые сохранения прогресса не запишутся.
- Значит часть прогресса после истечения сессии может потеряться до повторного логина.

## 10.5
Если мастер watch party отключится:
- `handleLeave()` удаляет клиента из комнаты — `scripts/watch-party-server.mjs:214-223`.
- Если это был мастер, роль передаётся следующему участнику: `room.masterParticipantId = room.clients.keys().next().value` — `scripts/watch-party-server.mjs:228-229`.
- Потом всем рассылается новый `room-state` — `scripts/watch-party-server.mjs:231`.
