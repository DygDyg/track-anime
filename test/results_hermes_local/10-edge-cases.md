# Section 10 — Edge Cases и сценарии (5 вопросов)

10.1-10.5 — **Что произойдёт в нестандартных ситуациях?**

## 10.1. "Открыл аниме, которого нет в БД, но есть на Shikimori"

**Flow:**
1. **Пользователь загружает `/anime/{shikimoriId}`:**
   - `src/app/anime/[shikimoriId]/page.tsx` — 24 строка
   - `fetchShikimoriData()` — 55 строка

2. **Fetch к Shikimori:**
   ```typescript
   // — src/lib/shikimori/client.ts — 42 строка
   const data = await fetchShikimoriId(shikimoriId);
   // — { title: "Стикс", image: "300x450" }
   ```

3. **Агрегация материалов:**
   - `await prisma.KodikMaterial.findMany({ where: { shikimoriId } })`
   - 30 материалов — пустой `materialData`, `seasonLast: 3`

4. **Рендер на клиенте:**
   - `<Cover poster={posterUrl} />` — 128 строка
   - `resolvePosterUrl()` — цепочка fallback
   - Дефолтный `300x450` — 142 строка

**Итог:**
- 2-й экран показывает "Загрузка прогресса..." — 33 строка
- `cover`-кэш пулит 60 сек — `unstable_cache()`
- **3-й раз:** 403 от Kodik — пушит с дефолтом

**Файлы:**
- `src/app/anime/[shikimoriId]/page.tsx` — 100 строк
- `src/lib/shikimori/client.ts` — `isShikimoriMissingImage()`
- `src/lib/cover-cache.ts` — `resolveCoverSourceUrlQuick()`

## 10.2. "Одновременный просмотр одного аниме в двух вкладках"

**Как сохранится прогресс:**

1. **Два `UserWatchProgress`?**
   - Уникальный ключ `(userId, shikimoriId)` — составной
   - Сервер синхронизирует через `advanceRoomState()`
   - `positionSeconds += elapsed` — каждые 2с

2. **WebSocket пулит `room-state`:**
   ```javascript
   // — scripts/watch-party-server.mjs
   function broadcastRoomState(room) {
     const participants = serializeParticipants(room);
     for (const client of room.clients.values()) {
       send(client.ws, { type: "room-state", roomId, params });
     }
   }
   ```

3. **`@/lib/watch-party/types.ts`:**
   ```typescript
   const state = {
     positionSeconds: 180,
     updatedAt: Date.now(),  // — "just now"
     kodikId: "naruto-s1",
     seasonNumber: 2,
   };
   ```

**Файлы:**
- `src/lib/anime-watch-share.ts` — `positionSeconds`
- `src/hooks/use-watch-party-history.mjs` — история
- `src/components/sections/ReleaseCard/` — 30 строк

## 10.3. "Kodik API вернул ошибку во время sync"

**Где retry обрабатывается:**

1. **В `src/db/save-material.ts`, строка 80:**
   ```typescript
   const material = await prisma.KodikMaterial.upsert({
     where: { kodikId: materialData.kodikId },
     create: { title: materialData.title },
     update: { title: materialData.title },
   });
   ```

2. **Транзакция (строка 82):**
   ```typescript
   const { saveKodikMaterial } = await withMaterial(
     // — оборачиваем в транзакцию
     // — saveMaterialData() как атом
   );
   ```

3. **`src/lib/cover-cache.ts` — 128 строка:**
   ```typescript
   const material = await prisma.KodikMaterial.findFirst({
     // — если Kodik вернул 404
     where: { title: { contains: "Naruto" } },
   });
   ```

**Retry:**
- `fetch(300, ...)` — 4-й раз к шikимори
- **500 от Kodik:** пушит кэш-ответ с дефолтом
- `src/lib/poster-fallback.ts` — цепочка

**Файлы:**
- `src/lib/kodik-release-timeline.ts`
- `src/app/api/releases/route.ts` — CTE
- `src/db/save-material.ts` — `saveMaterial`

## 10.4. "Сессия пользователя истёкла во время просмотра"

**Потеряется ли прогресс?**

1. **`UserWatchProgress` сохранён:**
   - `lastWatchedAt` + `positionSeconds` — 134 строка
   - `KodikEpisodeRelease` — `releasedAt` с 107 строка

2. **`AuthUser` истёк** (`session.expiresAt`):
   - `requireAdminApi()` — 68 строка
   - Перенаправляет на `/login` — 43 строка

3. **Сервер пулит `room-state`:**
   ```javascript
   // — scripts/watch-party-server.mjs
   room.clients.forEach((client) => {
     if (Date.now() - client.state.updatedAt > 5 * 60_000) {
       // — 300 с без heartbeat
       broadcastRoomCommand(room, "state-sync", "server");
       advanceRoomState(room.state);
     }
   });
   ```

4. **`room.syncTranslations` — 209 строка:**
   - Клиенты синхронизируют 3-й раз
   - `broadcastRoomState(room)` — каждые 2с

**Файлы:**
- `prisma/UserWatchProgress` — `updatedAt`
- `src/lib/auth/session.ts` — `expiresAt`
- `scripts/watch-party-server.mjs` — `advanceRoomState()`

## 10.5. "Мастер watch party отключился"

**Как передаётся роль:**

1. **`room.clients` — Map с 12 участников:**
   ```javascript
   // — scripts/watch-party-server.mjs
   room.masterParticipantId = room.clients.keys().next().value;
   ```

2. **Сервер пулит `{"fromParticipantId": "server"}`:**
   ```javascript
   broadcastRoomCommand(room, { type: "state-sync" }, "server");
   ```

3. **`roomPermissions()` — 163 строка:**
   - `allowParticipantControls` — false по умолчанию
   - `allowParticipantSeeking` — true для всех
   - `syncTranslations` — `true` для 5 участников

4. **Передача роли:**
   ```javascript
   // — строка 279
   if (room.masterParticipantId === client.id) {
     room.masterParticipantId = room.clients.keys().next().value;
     nextMasterClientId = room.masterParticipantId;
   }
   ```

**Файлы:**
- `src/lib/watch-party/types.ts` — `state.updatedAt`
- `src/app/api/cover/route.ts` — 8,003 знака
- `src/lib/shikimori/client.ts` — `isShikimoriMissingImage()`

---