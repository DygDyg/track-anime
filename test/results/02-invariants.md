# Раздел 2 — Инварианты проекта

## 2.1. Главный доменный ключ

```
Shikimori anime.id  ===  Kodik shikimori_id  ===  /anime/[shikimoriId]
```

Источник: `BUSINESS_LOGIC.md` § Domain Key; `AGENTS.md` Project Invariants.

## 2.2. Почему клиент не вызывает Shikimori/Kodik напрямую

**Причины:** секреты (`KODIK_API_TOKEN`, OAuth client secret), rate limiting, единый кэш/нормализация, безопасность токенов пользователя.

**Где зафиксировано / «проверяется»:**
- Правила: `AGENTS.md`, `.cursorrules`, `AI_CONTEXT.md`, `PROJECT_OVERVIEW.md`
- Практически: клиенты Kodik/Shikimori живут только в `src/kodik/` и `src/lib/shikimori/`; search помечен `import "server-only"` (`src/lib/search.ts`)
- Автоматического линтера «запрет fetch к shikimori» в репозитории **не найдено** — инвариант процессный + архитектурный

## 2.3. Уникальность watch progress

`@@unique([userId, shikimoriId])` — `prisma/schema.prisma` ~654.

**Почему не по translation:** прогресс — «где остановился в тайтле»; смена озвучки (`kodikId`) обновляет ту же строку, а не создаёт отдельную историю. Иначе пользователь терял бы позицию при смене студии.

## 2.4. Авторизация в API routes

| Функция | Файл | Поведение |
|---------|------|-----------|
| `getSession()` | `src/lib/auth/session.ts` | `AuthSession \| null` |
| `requireAdmin()` | `src/lib/auth/admin.ts` 5–14 | redirect `/login` или `/` |
| `requireAdminApi()` | `src/lib/auth/admin.ts` 16–25 | 401/403 JSON |

Пример (`src/app/api/user/watch-history/[shikimoriId]/route.ts` 33–37):

```typescript
const session = await getSession();
if (!session) {
  return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
}
```

`src/proxy.ts` — только legacy redirect, auth не проверяет.

## 2.5. Язык UI — русский

Примеры:
1. `"Войти"` — `src/components/auth/HeaderAuth.tsx` ~150
2. `"Продолжить"` — `src/components/anime/AnimeWatchPanel.tsx` ~3590
3. `"Нужна авторизация"` — `src/app/api/user/watch-history/[shikimoriId]/route.ts` ~20

## 2.6. Что такое `KodikMaterial`

С точки зрения домена: **одно аниме + одна озвучка (translation)** — комментарий в schema ~305–306.

Отличие от «аниме»: аниме идентифицируется `shikimoriId`; у одного аниме много materials с разными `translationId` / `playerLink` / `lastEpisode`.

## 2.7. Состояние долгих операций

| Модель | Назначение |
|--------|------------|
| `KodikImportJob` | Полный импорт (id=`"full"`), phase/status/nextPageUrl |
| `KodikSyncRun` | История incremental sync (status, newReleases, error) |

Также: `UserListSync` для sync списков Shikimori.

## 2.8. Несколько `KodikMaterial` на один `shikimoriId`

**Да.** PK — `kodikId`, индекс по `shikimoriId`. Разные студии озвучки = разные materials.

Пример: один тайтл с Anilibria и SoftBox — две строки `KodikMaterial` с общим `shikimoriId`, разными `translationId`/`translationTitle`. UI: выбор озвучки в `AnimeWatchPanel`.
