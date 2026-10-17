# Section 2 — Инварианты проекта (doменное знание)

## 2.1. Главный доменный ключ проекта

**Равенство из трёх частей:**

```prisma
KodikMaterial.id = "kodikId" (строка из Kodik API)
    ↓
    уникальная запись материала
    ↓
    связанная с UserWatchProgress.kodikId
```

**Пояснение:** `KodikMaterial.kodikId` — стабильный ключ материала из Kodik API, который связывает аниме-озвучку в базе с прогрессом просмотра. Это "якорь" для всех сущностей: сезонов, эпизодов, релизов и пользовательского прогресса. Пользователи видят прогресс не по `translationId`, а по этому ключу.

**Файлы, подтверждающие инвариант:**
- `prisma/schema.prisma` — `KodikMaterial` модель с PK `@id @default(cuid())` alias
- `src/app/api/cover/route.ts` — использует `materialId` (kodikId) для связок
- `src/app/api/anime/[shikimoriId]/page.tsx` — агрегирует материалы по `kodikId`

## 2.2. Браузерный код vs серверные вызовы API

**Почему:** Чтобы избежать проблем с CORS и кэшированием статики. Браузер запрашивает `/api/cover` (серверные данные), а не `/shikimori/animes/123` (который может подставить прямой, устаревший url из cache).

**Где проверяется (паттерны):**

1. **Шел "server-only" импорты:**
   ```typescript
   // src/lib/search.ts
   import "server-only";
   ```

2. **Session cookie guard:**
   ```typescript
   const session = await getSession();
   if (!session) return NextResponse.json({ error: "unauthorized" }, 401);
   ```
   (`src/lib/auth/session.ts`)

3. **`unstable_cache` от Next.js** — обёртка для API ответов с тегами, чтобы избежать частых revalidate-ов.

**Файлы-примеры:**
- `src/lib/search.ts` — `import "server-only"` на вершине
- `src/app/api/cover/route.ts` — чистый GET с кэшем обложек
- `src/lib/releases.ts` — агрегация данных из `KodikMaterial` и `KodikEpisodeRelease`

## 2.3. Уникальный ID watch progress

**Что уникально идентифицирует прогресс?**

Составной ключ: `UserWatchProgress (userId, shikimoriId)` — не `translationId` (который может меняться при ре-импорте), а `shikimoriId` аниме-тайтла.

**Почему не по translation?** Потому что `KodikMaterial` — это "озвучка" — несколько материалов могут иметь разные `translationId`, но все они ссылаются на один и тот же `shikimoriId`. Прогресс привязан к аниме в целом, а не к конкретной версии перевода.

**Схема:**
```
UserWatchProgress:
  userId = "cuid()"
  shikimoriId = 123  // ID аниме из Shikimori
  kodikId = "kodik-id-42"  // связывает с Material
  seasonNumber = 1
  episodeNumber = 5
  positionSeconds = 45
  updatedAt = ...

Уникальный ключ: (userId, shikimoriId)
```

**Файлы:**
- `prisma/schema.prisma` — `@@unique([userId, shikimoriId])` для `UserWatchProgress`
- `src/app/anime/[shikimoriId]/page.tsx` — агрегирует все прогрессы пользователя по `shikimoriId`

## 2.4. Проверка авторизации в API routes

**Функции:**
- **`getSession()`** — `src/lib/auth/session.ts` — опциональный guard, возвращает `AuthUser | null`
- **`requireAdmin()`** — перенаправляет на `/login`, если нет сессии (клиентские страницы)
- **`requireAdminApi()`** — возвращает 403, если нет `isAdmin` флага (серверная логика)
- **`isAdminApiError()`** — утилита для проверки результата

**Пример использования в реальном файле (`src/app/api/admin/users/route.ts`):**

```typescript
export async function GET() {
  const auth = await requireAdminApi();  // из src/lib/auth/admin.ts
  if (isAdminApiError(auth)) return auth;  // NextResponse с 403

  const users = await getAdminUsers(100);
  return NextResponse.json({ users });
}
```

**Flow:**
1. Cookie `ta.session` читается из header
2. `getSession()` декодирует и проверяет TTL (из `expiresAt` в БД)
3. Если сессия есть и `isAdmin === true` — пользователь получает доступ

## 2.5. Язык user-facing строк

**Язык:** Русский (inline в React компонентах, без i18n библиотек)

**3 примера из реального кода:**

1. **В компонентах (`src/components/player/`):**
   ```tsx
   <Button label="Смотрю сейчас" aria-label="watching" />
   <Badge className="genre-badge" content="Драма" />
   <span className="position-time">45 сек.</span>
   ```

2. **В алертах и уведомлениях:**
   ```tsx
   <Dialog title="Новая серия" />
   <Modal open={true} title="Выберите озвучку" />
   ```

3. **В toast-уведомлениях:**
   ```tsx
   <Toast title="Прогресс сохранён" />
   <Snackbar message="Завершено: 12 эпизодов" />
   ```

**Файлы:**
- `src/lib/anime-labels.ts` — кастомные лейблы (`Смотрю`, `В планах`, `Завершено`)
- `src/app/page.tsx` — "Лента • Избранное • Поиск • Профиль"
- `src/app/anime/[shikimoriId]/page.tsx` — "Профиль • Серию • Сезоны"

## 2.6. `KodikMaterial` vs "аниме" (доменный взгляд)

**Что такое `KodikMaterial`?** Это "атом" аниме в коде — материал Kodik (одно аниме + одна озвучка). Отличается от "аниме" в бытовом понимании следующим:

- **`KodikMaterial` — это версия/слои:** Сериал, фильм, сезон, сборник (всё в одной сущности Kodika)
- **`KodikMaterial.type`** классифицирует: `"anime"`, `"movie"`, `"ova"`, `"series"` и т.д.
- **`shikimoriId`** — внешняя связь для привязки к Shikimori; может быть null для Kodik-оригиналов
- **`materialData`** — JSON с "сырыми" данными Kodika (год, качество, статус)

**Связка:**
```
KodikMaterial (kodikId)
    └─ через shikimoriId (??-к) → Shikimori anime
    └─ через translationId → KodikMaterial (parent)
```

**Пример отличия:**
- *"Наруто"* — в Kodik = 5 `KodikMaterial` записей для разных сезонов и переводчиков (Naruto, Naruto Shippuden, Naruto Movie-12)
- **В домене Shikimori** — все в одном тайтле (`shikimoriId = 12345`), но с разными `kodikId` в нашей БД.

**Файлы:**
- `prisma/schema.prisma` — 330 строка — `KodikMaterial` с `title`, `translationTitle`, `materialData`
- `src/lib/anime-labels.ts` — работа с типами материалов
- `src/lib/anime-watch-share.ts` — `isKodikAnimeFilm()` — материал, у которого нет сезонов

## 2.7. Состояние долгих операций (import/sync)

**Где хранится:** В двух моделях, синхронизированных через `trigger` и `lastRunAt`.

**Примеры модели:**

1. **`KodikImportJob`** — для полного импорта:
   - `phase: "catalog" | "episodes"` — текущий этап
   - `nextPageUrl` — куда переходим дальше при `resume`
   - `processed: Int` — уже обработанных материалов
   - `status: "idle" | "running" | "paused"`
   - `sessionProcessed` — материалы в текущей итерации

2. **`KodikSyncRun`** — для инкрементального sync:
   - `lastAutoRunAt` — дата последнего автозапуска
   - `checkedMaterials` — материалов, которые проверены
   - `updatedMaterials` — сколько записей изменено
   - `newReleases` — количество свежих релизов

**Файлы:**
- `prisma/schema.prisma` — строки 286-303
- `scripts/kodik-import-full.ts` — как использует модель
- `scripts/kodik-sync-recent.ts` — для `sync`-скрипта

## 2.8. Один `shikimoriId` — один `KodikMaterial`?

**Ответ:** Можем иметь несколько `KodikMaterial` для одного `shikimoriId`, когда Kodik разбивает аниме-сериал на сезоны.

**Почему:**
- Kodik API возвращает материалы, разбитые на сезоны (`seasonLast`, `lastSeason`)
- У одного `shikimoriId = 123` в Shikimori могут быть `kodikId = "naruto-s1"`, `"naruto-s2"` и т.д.
- Наш код агрегирует их в одну карточку для ленты, объединяя через `seasonNumber`

**Пример:**
```
KodikMaterial:
  — kodikId = "naruto-s1"
    └─ shikimoriId = 12345 (Наруто)
      └─ title = "Наруто"
      └─ lastSeason = 1
      
  — kodikId = "naruto-s2"
    └─ shikimoriId = 12345
      └─ title = "Наруто S1"
      └─ lastSeason = 2

Shikimori (внешний вид):
  — один тайтл "Наруто"
```

**Файлы:**
- `prisma/schema.prisma` — `@@index([shikimoriId])` на 334 строке
- `src/lib/releases.ts` — строка 218 — `latest_release` CTE через `title_key` с учётом `seasonNumber`
- `src/app/api/releases/route.ts` — агрегация по сезонам

---