## 2.1
Главный доменный ключ:
`Shikimori anime.id === Kodik shikimori_id === /anime/[shikimoriId]`.
Подтверждение: `BUSINESS_LOGIC.md:5-14`, `PROJECT_OVERVIEW.md:58-60`.

## 2.2
Браузерный код не должен вызывать Shikimori/Kodik напрямую, потому что:
- токены и rate limiting должны жить на сервере;
- это проектный инвариант;
- браузер должен работать через `/api/*` и server lib.
Подтверждение: `PROJECT_OVERVIEW.md:58-60`, `ARCHITECTURE.md:31-35`, `AI_CONTEXT.md:15-16,29`.
Проверяется организационно и архитектурно, а не единственным middleware: внешние клиенты находятся в `src/lib/shikimori/*`, `src/kodik/*`, а client-side код использует `fetch("/api/...")`, пример `ARCHITECTURE.md:31-35`.

## 2.3
Watch progress уникален по `(userId, shikimoriId)`, а не по translation.
Подтверждение:
- инвариант в docs: `BUSINESS_LOGIC.md:58-60`;
- реальный upsert: `src/lib/watch-history.ts:334-355`, ключ `userId_shikimoriId`.
Почему не по translation: пользовательский прогресс относится к тайтлу/эпизоду, а не к конкретной озвучке; `kodikId` хранится как текущее последнее состояние, но не входит в уникальный ключ.

## 2.4
Авторизация в API routes:
- `getSession()` для обычной auth — `src/lib/auth/session.ts:37-59`.
- `requireAdminApi()` для admin API — `src/lib/auth/admin.ts:16-25`.
Пример:
- `src/app/api/user/watch-history/[shikimoriId]/route.ts:17-21,33-37,92-96`.
- `src/app/api/admin/watch-party/rooms/route.ts` использует admin guard, подтверждено поиском `requireAdminApi`.

## 2.5
User-facing строки на русском.
Примеры:
- `"Нужна авторизация"` — `src/app/api/user/watch-history/[shikimoriId]/route.ts:20,36,95`.
- `"Гость 1234"` формируется как `Гость ${suffix}` — `src/hooks/useWatchParty.ts:40-49`.
- `"Совместный просмотр выключен администратором."` — `src/hooks/useWatchParty.ts:247-253`.

## 2.6
`KodikMaterial` в домене — это не “аниме целиком”, а “одно аниме + одна озвучка”.
Подтверждение:
- `prisma/schema.prisma:187-222` комментарий и поля `translationId`, `translationTitle`, `translationType`.
- `BUSINESS_LOGIC.md:9-10`.

## 2.7
Состояние долгих операций хранится в Prisma models:
- `KodikSyncRun` — `prisma/schema.prisma:151-166`.
- `KodikImportJob` — `prisma/schema.prisma:168-185`.
Это также зафиксировано в `CONVENTIONS.md:107-109`.

## 2.8
Да, один `shikimoriId` может иметь несколько `KodikMaterial`.
Почему:
- `KodikMaterial` = отдельная озвучка одного тайтла;
- у одного аниме несколько `translationId/translationTitle`.
Подтверждение: `BUSINESS_LOGIC.md:9-10`, `prisma/schema.prisma:188-203`.
Пример в коде: страница аниме загружает `translations: KodikTranslationDto[]` для одного `shikimoriId` — `src/lib/anime-page.ts:23-33,35-60`.
