# Раздел 8 — Документация

## 8.1. Если я добавлю новый API route `/api/user/bookmarks` — какие документы нужно обновить? Перечисли конкретные файлы и секции.

Документы для обновления:
- `ARCHITECTURE.md` - добавить описание нового endpoint
- `AI_CONTEXT.md` - критические пути
- `docs/kodik-api/` - если API связано с Kodik
- `docs/shikimori-api/` - если API связано с Shikimori

## 8.2. Если я изменю формат ответа `/api/releases` — что сломается? Какие компоненты зависят от этого API?

Сломаются:
- `src/components/ReleaseFeed.tsx`
- `src/lib/releases.ts`
- `src/app/api/releases/route.ts`

## 8.3. Если я добавлю новый канал нотификаций (email) — какие файлы и документы затронуты?

Файлы:
- `src/lib/notifications/email.ts`
- `src/lib/notifications/dispatcher.ts`
- `src/app/api/notifications/route.ts`

Документы:
- `AI_CONTEXT.md` - добавить новый канал
- `ARCHITECTURE.md` - обновить схему нотификаций

## 8.4. Если я поменяю Prisma schema (добавлю поле в `KodikMaterial`) — какие шаги нужно выполнить? Какие файлы обновить?

Шаги:
1. Создать migration через `npx prisma migrate dev`
2. Обновить типы в `src/kodik/types.ts`
3. Обновить логику работы с моделью в `src/db/save-material.ts`

## 8.5. Составь чеклист документации для PR, который добавляет новую страницу `/settings` с пользовательскими настройками.

- [ ] Добавить описание новой страницы в `PROJECT_OVERVIEW.md`
- [ ] Обновить `ARCHITECTURE.md` с описанием новой страницы
- [ ] Добавить информацию в `AI_CONTEXT.md` 
- [ ] Обновить `CONVENTIONS.md` если есть новые соглашения
- [ ] Документировать API endpoint для настроек