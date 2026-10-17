# Раздел 2 — Инварианты

## 2.1
Главный доменный ключ (равенство из трёх частей):

**`Shikimori anime.id === Kodik shikimori_id === /anime/[shikimoriId]`**

Подтверждение: `PROJECT_OVERVIEW.md:58-60`, `BUSINESS_LOGIC.md` (начало), маршруты `src/app/anime/[shikimoriId]`.

Не путать с `KodikMaterial.kodikId` — это PK **конкретного материала/озвучки**.

## 2.2
Почему browser → Shikimori/Kodik напрямую нельзя:
- токены API (`KODIK_API_TOKEN`, OAuth client secret) только на сервере;
- rate limits и кэш централизованы;
- проектный инвариант docs/AGENTS.

**Где «проверяется»:** организационно/архитектурно, не единым auth-middleware.
- Внешние клиенты: `src/kodik/*`, `src/lib/shikimori/*` (server).
- Клиент ходит в `fetch("/api/...")`.
- `src/proxy.ts` — **только** legacy redirect `?shikimori_id=` → `/anime/{id}`, не API-guard.

## 2.3
Watch progress уникален по **`(userId, shikimoriId)`** — `prisma/schema.prisma` model `UserWatchProgress` `@@unique([userId, shikimoriId])` ~654; upsert в `src/lib/watch-history.ts` `upsertWatchProgress` ~330+.

**Почему не по translation:** прогресс — «где пользователь в тайтле», а не «в какой озвучке». `kodikId` хранится как последнее выбранное состояние, но не входит в unique key. Смена озвучки не создаёт вторую «историю» того же аниме.

## 2.4
Авторизация в API routes:
- `getSession()` — `src/lib/auth/session.ts:47+`.
- `requireAdmin()` / `requireAdminApi()` — `src/lib/auth/admin.ts:5+`, `16+`.

Пример (user):
```ts
// src/app/api/user/watch-history/[shikimoriId]/route.ts
const session = await getSession();
if (!session) {
  return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
}
```

Пример (admin): множество `src/app/api/admin/**/route.ts` — `const auth = await requireAdminApi();` (например `admin/sync`, `admin/brand-rotation/settings`, `admin/cover-cache/settings`).

## 2.5
User-facing строки — **русский**.

Примеры из кода:
1. `"Нужна авторизация"` — `src/app/api/user/watch-history/[shikimoriId]/route.ts`.
2. Гостевое имя вида `Гость ${suffix}` — `src/hooks/useWatchParty.ts`.
3. Сообщения про совместный просмотр / ошибки API на RU (watch party hook, admin/user routes).
4. Labels в `src/lib/anime-labels.ts` («Смотрю», статусы списков и т.п.).

## 2.6
`KodikMaterial` с точки зрения домена = **одно аниме + одна озвучка** (как объект Kodik API), не «тайтл целиком».

Отличие от «аниме»:
- аниме идентифицируется `shikimoriId`;
- у одного аниме N materials с разными `translationId` / `translationTitle`;
- плеер выбирает material, лента релизов привязана к material+episode.

См. комментарий у model в `prisma/schema.prisma:305-306`, поля translation*.

## 2.7
Состояние долгих операций:
- **`KodikSyncRun`** — `prisma/schema.prisma:270+` (status, processed, lastError, session* counters).
- **`KodikImportJob`** — `prisma/schema.prisma:287+` (import progress).

Также могут быть related admin job models; основные для import/sync — эти две (`CONVENTIONS.md` / docs).

## 2.8
**Да.** Один `shikimoriId` → много `KodikMaterial`.

Почему: каждая озвучка/версия в Kodik — отдельный material с своим `kodikId` и `translationId`.

Пример: `getAnimePageData` собирает `translations: KodikTranslationDto[]` для одного `shikimoriId` из нескольких materials — `src/lib/anime-page.ts` (DTO + loader ~402+).
