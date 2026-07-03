# Track Anime

Веб-приложение для просмотра аниме с интеграцией [Shikimori](https://shikimori.one) (списки, профиль, OAuth) и [Kodik](https://kodik.info) (плеер, озвучки, каталог). Пользователи входят через Shikimori, смотрят аниме во встроенном плеере, сохраняют прогресс и синхронизируют списки.

**Production:** https://ta.dygdyg.ru/

## Возможности

- **Лента релизов** — новые серии с бесконечной прокруткой
- **Страница аниме** — метаданные Shikimori, выбор озвучки, Kodik-плеер с сохранением позиции
- **Поиск** — быстрый и расширенный (поля, жанры, год, мин. рейтинг Shikimori)
- **Избранное и списки** — локальный кэш списков Shikimori (смотрю, в планах и др.)
- **История просмотра** — сезон, серия, прогресс в секундах
- **Календарь** — расписание выхода серий ongoing-аниме
- **Профили** — публичные страницы пользователей по Shikimori ID
- **PWA** — установка как приложение, офлайн-страница
- **Discord Rich Presence** — статус «смотрю» через локальный tray-приложение
- **Админка** — импорт Kodik, sync, настройки, DB explorer

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| Backend | Next.js API Routes, TypeScript |
| БД | PostgreSQL 16, Prisma 6 |
| Auth | Shikimori OAuth2 (без NextAuth) |
| Видео | Kodik iframe + postMessage API |

## Быстрый старт

### Требования

- Node.js 20+
- Docker (для PostgreSQL) или свой экземпляр Postgres
- Токен Kodik API — [bd.kodikres.com](https://bd.kodikres.com)
- OAuth-приложение Shikimori — [shikimori.one/oauth/applications](https://shikimori.one/oauth/applications)

### Установка

```bash
git clone https://github.com/DygDyg/track-anime.git
cd track-anime
npm ci
cp .env.example .env
# заполните DATABASE_URL, KODIK_API_TOKEN, SHIKIMORI_CLIENT_ID/SECRET, AUTH_URL
```

### База данных

```bash
npm run docker:up      # PostgreSQL в Docker
npm run db:push        # применить схему Prisma
```

### Импорт каталога Kodik

```bash
npm run kodik:import           # полный импорт
npm run kodik:import:resume    # продолжить прерванный
npm run kodik:sync             # инкрементальный sync
```

### Разработка

```bash
npm run dev
```

Сайт: http://localhost:3000

Redirect URI в Shikimori для dev:

```
http://localhost:3000/api/auth/callback/shikimori
```

## Основные команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер Next.js |
| `npm run build` | Production-сборка |
| `npm run start` | Запуск production |
| `npm run db:studio` | Prisma Studio |
| `npm run kodik:sync` | Sync новых материалов Kodik |
| `npm run kodik:sync:scheduled` | Sync для cron |
| `npm run deploy` | Деплой на production (Windows) |

Полный список — в `package.json`.

## Переменные окружения

Минимальный набор (см. `.env.example`):

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `KODIK_API_TOKEN` | Токен Kodik API |
| `SHIKIMORI_CLIENT_ID` | OAuth client ID |
| `SHIKIMORI_CLIENT_SECRET` | OAuth client secret |
| `AUTH_URL` | Базовый URL сайта (для OAuth redirect) |
| `ADMIN_SHIKIMORI_IDS` | Shikimori ID админов через запятую |

## Структура проекта

```
src/
├── app/           # страницы и API routes (App Router)
├── components/    # React-компоненты
├── lib/           # серверная логика, поиск, auth, sync
├── kodik/         # клиент Kodik API
└── hooks/         # React-хуки

prisma/            # схема БД
scripts/           # импорт, sync, deploy, Discord tray
docs/              # справочники API (Kodik, Shikimori)
```

**Принцип:** браузер не ходит напрямую в Shikimori/Kodik — только через серверные модули. Ключ связи данных: `shikimoriId` (`/anime/[shikimoriId]`).

## Деплой

Production-сервер и подробности — в [docs/DEPLOY.md](docs/DEPLOY.md).

```powershell
npm run deploy
```

## Документация

| Файл | Содержание |
|------|------------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Обзор проекта |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Архитектура и потоки данных |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Карта кодовой базы |
| [docs/SERVER.md](docs/SERVER.md) | Production-сервер |
| [docs/kodik-api/](docs/kodik-api/) | Справочник Kodik API |
| [docs/shikimori-api/](docs/shikimori-api/) | Справочник Shikimori API |

## Лицензия

Private repository. All rights reserved.
