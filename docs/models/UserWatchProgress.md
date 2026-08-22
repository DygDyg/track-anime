# UserWatchProgress — Прогресс просмотра

## Описание

Модель хранит позицию просмотра для каждого аниме пользователя. Одна запись соответствует одному аниме (`shikimoriId`), независимо от количества озвучек.

## Схема Prisma

```prisma
model UserWatchProgress {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  shikimoriId     Int
  kodikId         String
  seasonNumber    Int      @default(1)
  episodeNumber   Int      @default(1)
  positionSeconds Float    @default(0)
  updatedAt       DateTime @updatedAt
  createdAt       DateTime @default(now())

  @@unique([userId, shikimoriId])
  @@index([userId, updatedAt(sort: Desc)])
  @@index([shikimoriId])
  @@index([kodikId])
}
```

## Поля

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `String` | Уникальный идентификатор записи |
| `userId` | `String` | ID пользователя (FK к `User.id`) |
| `shikimoriId` | `Int` | ID аниме в Shikimori (уникальная пара с `userId`) |
| `kodikId` | `String` | ID материала Kodik (озвучка) |
| `seasonNumber` | `Int` | Номер сезона, до которого просмотрели |
| `episodeNumber` | `Int` | Номер серии, до которой просмотрели; `0` — закладка «ещё не смотрели» (`positionSeconds` тоже `0`) |
| `positionSeconds` | `Float` | Позиция в секундах в текущей серии |
| `updatedAt` | `DateTime` | Время последнего обновления |
| `createdAt` | `DateTime` | Время создания записи |

## Индексы

- `@@unique([userId, shikimoriId])` — уникальная пара для одного пользователя и аниме
- `@@index([userId, updatedAt(sort: Desc)])` — для получения истории просмотра пользователя
- `@@index([shikimoriId])` — для поиска прогресса по аниме
- `@@index([kodikId])` — для поиска прогресса по озвучке

## Связи

- **User** (`onDelete: Cascade`) — при удалении пользователя удаляются все его записи прогресса

## DTO (Data Transfer Object)

```typescript
export type WatchProgressDto = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  createdAt: string;
  updatedAt: string;
};
```

## Функции модуля

### `getWatchProgress(userId, shikimoriId)`

Возвращает прогресс просмотра для конкретного аниме пользователя.

```typescript
async function getWatchProgress(
  userId: string,
  shikimoriId: number,
): Promise<WatchProgressDto | null>
```

### `upsertWatchProgress(userId, input)`

Сохраняет или обновляет прогресс просмотра. Автоматически удаляет запись, если просмотр завершён полностью.

```typescript
async function upsertWatchProgress(
  userId: string,
  input: {
    shikimoriId: number;
    kodikId: string;
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  },
): Promise<WatchProgressDto | null>
```

### `deleteWatchProgress(userId, shikimoriId)`

Удаляет прогресс просмотра для конкретного аниме.

```typescript
async function deleteWatchProgress(userId: string, shikimoriId: number): Promise<boolean>
```

### `getWatchHistory(userId, limit)`

Возвращает историю просмотра пользователя (до `limit` записей).

```typescript
async function getWatchHistory(userId: string, limit = 100): Promise<WatchHistoryItemDto[]>
```

## API Endpoints

### `GET /api/user/watch-history/[shikimoriId]`

Возвращает прогресс просмотра для конкретного аниме.

**Ответ:**
```json
{
  "progress": {
    "shikimoriId": 12345,
    "kodikId": "kodik-123",
    "seasonNumber": 1,
    "episodeNumber": 12,
    "positionSeconds": 3600,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T01:00:00Z"
  }
}
```

### `PUT /api/user/watch-history/[shikimoriId]`

Сохраняет прогресс просмотра.

**Тело запроса:**
```json
{
  "kodikId": "kodik-123",
  "seasonNumber": 1,
  "episodeNumber": 12,
  "positionSeconds": 3600
}
```

Закладка без просмотра (`episodeNumber: 0`, `positionSeconds: 0`, только `seasonNumber: 1`):
```json
{
  "kodikId": "kodik-123",
  "seasonNumber": 1,
  "episodeNumber": 0,
  "positionSeconds": 0
}
```

**Ответ:**
```json
{
  "progress": { ... },
  "cleared": false
}
```

### `DELETE /api/user/watch-history/[shikimoriId]`

Удаляет прогресс просмотра.

**Ответ:**
```json
{
  "ok": true
}
```

## Бизнес-логика

### Автоудаление завершённого просмотра

Запись удаляется автоматически, если:
1. Аниме завершено (не ongoing, не anons)
2. Просмотр достиг последней серии сезона
3. Позиция превышает порог завершения (настраивается в [`WatchHistorySettings`](docs/models/WatchHistorySettings.md))

Порог определяется в [`getWatchHistoryCompleteThresholdRatio()`](src/lib/admin/watch-history-settings.ts).

### Уникальность

Для одного пользователя и аниме может быть только одна запись прогресса. При обновлении используется `upsert`.

### История просмотра

История возвращается в хронологическом порядке по `updatedAt` (новые записи первыми).

## Использование в других модулях

- [`src/lib/history-new-episodes.ts`](../src/lib/history-new-episodes.ts) — определение новых серий для уведомлений
- [`src/lib/notifications/dispatcher.ts`](../src/lib/notifications/dispatcher.ts) — отправка уведомлений о новых сериях
- [`src/lib/admin/db-explorer.ts`](../src/lib/admin/db-explorer.ts) — админ-интерфейс для просмотра записей