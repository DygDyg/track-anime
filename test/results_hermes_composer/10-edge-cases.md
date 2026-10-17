# Раздел 10 — Edge cases

## 10.1
Аниме есть на Shikimori, нет materials в локальной БД:
1. `page.tsx` → `getAnimePageData(shikimoriId)` — `src/lib/anime-page.ts:402+`.
2. Loader тянет Shikimori metadata (cache/refresh/live) + materials из PG.
3. Условие: `if (!anime && materials.length === 0) return null` — **`anime-page.ts:435`**.
4. Если Shikimori данные есть, а materials пусты → DTO может вернуться **без playable translations** (страница открывается, смотреть нечего / пустой выбор озвучек).
5. Если и anime null, и materials пусты → `notFound()` — `src/app/anime/[shikimoriId]/page.tsx:77-78`.

Импорт Kodik позже заполнит materials; отдельного auto-import on page open в базовом flow **не требуется** для открытия metadata.

## 10.2
Две вкладки, одно аниме:
- Обе пишут `PUT /api/user/watch-history/[shikimoriId]` → `upsertWatchProgress` на ключ **`(userId, shikimoriId)`**.
- **Last write wins:** season/episode/position/kodikId перезаписываются последним успешным PUT.
- Multi-tab merge/CRDT **нет**; возможны «откаты» позиции, если старая вкладка шлёт устаревший progress позже.

## 10.3
Kodik API error во время sync:
- `runKodikIncrementalSync` — `src/lib/admin/kodik-sync.ts:41+`.
- `catch` (~195+): пишет run `status: "error"`, `lastError` / error fields, **rethrow**.
- **Внутреннего retry/backoff в одном run — нет** (`НЕ ПОДТВЕРЖДЕНО` как feature).
- Повтор: внешний cron (`kodik:sync:scheduled`), ручной admin sync, resume import scripts.

Частично сохранённые materials до ошибки остаются в БД (per-item save до fail).

## 10.4
Сессия истекла mid-watch:
- Плеер (iframe) может продолжать играть локально.
- Следующий `PUT watch-history` → **401** `"Нужна авторизация"` — route watch-history.
- **Новые** позиции после expiry **не сохраняются** (потеря хвоста сессии до re-login).
- Уже записанный progress в БД остаётся.
- Client должен обработать 401 (reauth); если silent fail — пользователь не заметит потерю.

## 10.5
Мастер watch party disconnect:
- `ws` close/error → `handleLeave(ws)` — `scripts/watch-party-server.mjs:262+`, handlers ~456-457.
- Если `room.masterParticipantId === client.id`:  
  `room.masterParticipantId = room.clients.keys().next().value` — **~279-281**.
- Рассылка обновлённого room-state / presence остальным.
- Если комната пуста — room cleanup (см. дальнейший код leave).
- Новый master получает право слать play/pause/seek; гости следуют protocol checks `isMaster`.
