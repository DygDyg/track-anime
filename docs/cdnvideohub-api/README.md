# CDN VideoHub — Content API

Локальная документация по публичному **Content API** балансера [CDN VideoHub](https://cdnvideohub.com/).

> Источник: [Swagger UI](https://public-api.cdnvideohub.com/api/v1/docs/index.html) → [`doc.json`](https://public-api.cdnvideohub.com/api/v1/docs/doc.json)  
> Версия спецификации: **0.1.0** (снимок: [`openapi-v0.1.0.json`](./openapi-v0.1.0.json))

## Оглавление

| Раздел | Файл | Описание |
|--------|------|----------|
| Обзор | [overview.md](./overview.md) | Базовый URL, auth, пагинация, ошибки, синхронизация |
| Тайтлы | [titles.md](./titles.md) | Список, поиск, карточка, фильтры, restricted |
| Сезоны и эпизоды | [seasons-episodes.md](./seasons-episodes.md) | Сезоны тайтла, эпизоды сезона |
| Справочники | [references.md](./references.md) | Страны, жанры, студии |
| **Плеер на сайт** | [player-integration.md](./player-integration.md) | Виджет, plapi, связка с Content API |
| **Установка плеера (Partners)** | [player-setup-partners.md](./player-setup-partners.md) | Официальная дока ЛК: параметры, события, методы, **запрет iframe** |
| **ЛК Partners** | [partners-portal.md](./partners-portal.md) | Карта разделов ЛК, токен, pub, стол заказов, FAQ лендинга |
| Модуль DLE | [dle-module.md](./dle-module.md) | Официальная дока DLE (для TA не нужен; ID/partner/тег плеера) |
| Примеры ответов | [examples.json](./examples.json) | Урезанные live-ответы Content API (без токена) |

## Базовые сведения

| | |
|--|--|
| **Базовый URL** | `https://public-api.cdnvideohub.com` |
| **Префикс** | `/api/v1` |
| **Формат** | JSON |
| **Метод** | только `GET` (в опубликованной спецификации) |
| **Auth** | Bearer token в заголовке `Authorization` |
| **Назначение** | каталог контента: тайтлы, сезоны, эпизоды и метаданные |

## Каталог vs плеер

Опубликованный Swagger — только **Content API** (каталог).  
Встраивание плеера, плейлисты и стримы — отдельный слой на `plapi.cdnvideohub.com` + виджет `player.cdnvideohub.com`.

→ Пошаговая интеграция: **[player-integration.md](./player-integration.md)**.
