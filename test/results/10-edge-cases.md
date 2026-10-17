# Раздел 10 — Edge Cases и сценарии

## 10.1. Аниме есть на Shikimori, нет в локальной БД

1. `getAnimePageData(shikimoriId)` грузит Shikimori metadata (cache/API).
2. Если реальных `KodikMaterial` нет / только stubs → `ensureKodikMaterialsForShikimoriId` (`kodik-ensure-materials.ts` 9–44): Kodik `/search?shikimori_id=` → `saveKodikMaterial`.
3. Если Kodik тоже пуст/ошибка: страница показывает метаданные Shikimori, **плеер недоступен** (`BUSINESS_LOGIC.md` Edge Cases).
4. 404 только если Shikimori ID невалиден / нет данных Shikimori (`AI_CONTEXT` pitfalls).

## 10.2. Две вкладки, одно аниме

Оба клиента пишут `PUT` в один `UserWatchProgress` с `@@unique([userId, shikimoriId])`.

**Итог:** last-write-wins по `upsert` в `watch-history.ts`. Позиция/серия из вкладки, сохранившейся позже, перезапишет другую. Конфликтов merge нет; локальный плеер в каждой вкладке живёт своим state до следующего save/reload.

## 10.3. Ошибка Kodik API во время sync

- **HTTP:** `src/kodik/client.ts` ретраит 429/5xx с backoff `1000 * 2**(attempt-1)`.
- **Job:** `kodik-sync.ts` catch → `KodikSyncRun.status = "error"`, finish job session error, rethrow. Автоматического re-queue failed run в том же catch **нет**.
- Concurrent: `skipIfRunning` → `sync_already_running`.
- Следующий запуск — cron `kodik-sync-scheduled` / ручной admin sync.

## 10.4. Сессия истекла во время просмотра

1. Клиент `saveProgressNow`: если `!user` — **return** без save (`AnimeWatchPanel` ~993).
2. API без session → **401** (`watch-history/route.ts` 34–36).
3. Клиент при `!res.ok` / network — **тихий return/catch**, без toast.
4. Плеер продолжает играть локально; **прогресс после истечения не пишется** (потеря незасохранённого хвоста).
5. TA-сессия TTL 1 год + sliding; при мёртвом Shikimori token TA-сессия **остаётся**, но list API могут отдать `shikimori_auth`.

## 10.5. Мастер watch party отключился

`scripts/watch-party-server.mjs` `handleLeave` (~262–289): если ушедший был master → `room.masterParticipantId =` следующий из `room.clients.keys()`, затем `broadcastRoomState`.

Комната живёт, пока есть участники; при пустой комнате / рестарте WS — ephemeral state пропадает (история сессии может закрыться в БД). Клиенты узнают нового мастера через `room-state` (`useWatchParty.ts`).
