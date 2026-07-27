# Раздел 7 — Конвенции проекта

## 7.1. Какой стиль именования файлов используется? (kebab-case, camelCase, PascalCase — для каких типов файлов?)

- kebab-case: lib модули (`anime-page.ts`, `kodik-sync-settings.ts`)
- PascalCase: React компоненты (`AnimeWatchPanel.tsx`, `ReleaseCard.tsx`)
- camelCase: переменные и функции

## 7.2. Как организованы импорты? Есть ли path aliases? Какие?

Импорты организованы по следующим правилам:
- Используются path aliases: `@/lib/`, `@/components/`, `@/app/`
- Относительные пути для локальных файлов

## 7.3. Какой паттерн используется для API routes? (App Router conventions)

Используется App Router pattern:
- `src/app/api/[route]/route.ts` - структура API endpoint
- Используются стандартные Next.js API route conventions

## 7.4. Как в проекте разделены серверные и клиентские компоненты? Есть ли `"use client"` / `"use server"` директивы?

Разделение:
- Серверные компоненты: `src/app/` директория
- Клиентские компоненты: помечаются `"use client"`
- Используются директивы `use client` и `use server`

## 7.5. Прочитай `CONVENTIONS.md` и перечисли 5 ключевых правил, которые должен соблюдать разработчик.

1. Использовать kebab-case для lib модулей
2. Использовать PascalCase для React компонентов
3. Помечать клиентские компоненты директивой `"use client"`
4. Использовать path aliases (`@/lib/`, `@/components/`)
5. Соблюдать структуру API routes в `src/app/api/[route]/route.ts`