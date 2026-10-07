# CDN VideoHub Content API — обзор

> Источник: [public-api.cdnvideohub.com/api/v1/docs](https://public-api.cdnvideohub.com/api/v1/docs/index.html)  
> Title в спецификации: **Content API** — «Каталог контента: тайтлы, сезоны, эпизоды и их метаданные.»

## Базовый URL

```
https://public-api.cdnvideohub.com/api/v1/...
```

В OpenAPI поля `host` / `schemes` пустые — фактический хост документации и API: **`public-api.cdnvideohub.com`**, схема HTTPS.

## Авторизация

Все эндпоинты требуют **Bearer**-токен.

```http
Authorization: Bearer <token>
```

В спецификации схема названа `BearerAuth` (`apiKey` в заголовке `Authorization`).

Проверенные ответы без/с неверным токеном:

| Ситуация | HTTP | Тело |
|----------|------|------|
| Нет заголовка | `401` | `{"error":{"code":"unauthorized","message":"missing bearer token"}}` |
| Неверный токен | `401` | `{"error":{"code":"unauthorized","message":"invalid token"}}` |

Токен выдаётся в ЛК партнёра: [partners…/docs/content-api](https://partners.cdnvideohub.com/docs/content-api) или **Настройки** → кнопка **«Показать токен»** (в публичном OpenAPI способа получения нет). Карта ЛК: [partners-portal.md](./partners-portal.md).

JWT (ES512): в payload встречаются поля вроде `uid`, `admin`, `iat`. Рабочий токен даёт `200` на каталожных эндпоинтах.

> Не коммитьте Bearer-токены в git и не вставляйте их в markdown. Храните в env / secret store.

## Формат ошибок

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

Типичные коды HTTP из спецификации:

| Код | Когда |
|-----|--------|
| `400` | Невалидные query/path (пустой id-фильтр, неверный параметр и т.д.) |
| `401` | Нет или неверный Bearer |
| `404` | Тайтл / сезон не найден |
| `500` | Внутренняя ошибка сервера |

## Пагинация (курсор)

Списковые эндпоинты с пагинацией возвращают:

| Поле | Тип | Описание |
|------|-----|----------|
| `items` | array | Страница результатов |
| `has_more` | boolean | Есть ли следующая страница |
| `next_cursor` | string | Курсор для следующего запроса |
| `total` | integer | Только у `/titles` при `with_count=true` |

Параметры запроса:

| Параметр | По умолчанию | Диапазон | Описание |
|----------|--------------|----------|----------|
| `limit` | `20` | `1`–`100` | Размер страницы |
| `cursor` | — | — | Значение `next_cursor` из предыдущего ответа |

Цикл синхронизации:

1. Запрос без `cursor` (или с `updated_since` + `sort=updated_at_asc`).
2. Обработать `items`.
3. Пока `has_more === true` — повторить с `cursor=<next_cursor>`.

## Инкрементальная синхронизация

Для `/titles` и `/titles/restricted`:

- `updated_since` — RFC3339, например `2026-01-15T00:00:00Z`
- для `/titles` рекомендуется пара: `sort=updated_at_asc` + `updated_since`

Так курсор идёт детерминированно по времени изменения.

## Карта эндпоинтов

### Справочники

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/v1/countries` | Все страны (код ISO 3166-1 alpha-2 + название) |
| `GET` | `/api/v1/genres` | Все жанры (код + название) |
| `GET` | `/api/v1/studios` | Список студий |

→ [references.md](./references.md)

### Тайтлы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/v1/titles` | Список с фильтрами и пагинацией |
| `GET` | `/api/v1/titles/filters` | Доступные коды фильтров |
| `GET` | `/api/v1/titles/search` | Поиск по тексту (`q`) |
| `GET` | `/api/v1/titles/restricted` | Реестр ограниченных (lgbt / licensed) |
| `GET` | `/api/v1/titles/{title_id}` | Карточка тайтла |

→ [titles.md](./titles.md)

### Сезоны и эпизоды

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/v1/titles/{title_id}/seasons` | Сезоны тайтла |
| `GET` | `/api/v1/titles/{title_id}/seasons/{season_number}/episodes` | Эпизоды сезона |

→ [seasons-episodes.md](./seasons-episodes.md)

## Внешние идентификаторы

**Query-параметры** `/titles` (Swagger) и **ключи в `external_ids` ответа** — разные имена.

| Query (`/titles?...`) | Ключ в `external_ids` | Источник | Заметки (live) |
|-----------------------|----------------------|----------|----------------|
| `kinopoisk_id` | `kp` | Кинопоиск | Числовой id строкой, напр. `"841279"` |
| `imdb_id` | `imdb` | IMDb | **Без** префикса `tt` (`"3717532"`). С `tt…` — пустая выдача |
| `mal_id` | `mal` | MyAnimeList | |
| `mdl_id` | `mdl` | MyDramaList | |

Точное совпадение по query. Не все тайтлы имеют полный набор внешних ID.

## Проверено на живом API (2026-09-11)

С валидным Bearer:

| Эндпоинт | Результат |
|----------|-----------|
| `/countries` | ~254 записи, `code` ISO + `name` |
| `/genres` | ~109 записей, `code` + `name` |
| `/studios` | большой список, есть `legacy_id` |
| `/titles?direction=anime&type=tv` | UUID `id`, курсор, `has_more` |
| `/titles?kinopoisk_id=` / `mal_id=` / `imdb_id=` | находит тайтл |
| `/titles?genres=action` | код жанра работает |
| `/titles?genres=аниме` (имя) | пусто — для фильтра нужны **коды** |
| `/titles/filters` | отдаёт **отображаемые имена** стран/жанров, не коды (расхождение со Swagger) |
| `/titles/{id}` | карточка + `genre_codes` / `country_codes` / `available_voices` |
| `.../seasons` / `.../episodes` | метаданные; стрим-URL нет |
| Постеры | `https://poster.cdnvideohub.com/{uuid}.webp` (uuid постера может ≠ `id` тайтла) |

Урезанные примеры ответов: [`examples.json`](./examples.json).

## Направления и типы

**Тип контента** (`type`):

| Значение | Смысл |
|----------|--------|
| `movie` | Фильм |
| `tv` | Сериал |

**Направление** (`direction`):

| Значение | Смысл |
|----------|--------|
| `anime` | Аниме |
| `dorama` | Дорама |
| `turkey` | Турецкое |
| `west` | Западное |

## Качество: resolution vs release type

В ответах тайтла/эпизода два разных поля:

| Поле | Что это | Примеры |
|------|---------|---------|
| `source_qualities` | Разрешение видео, лучшее первым | `1080p`, `720p` |
| `source_types` | Тип релиза (`code` + `label`) | WEB-DL, BD-Rip, CAMRip, … |

Не путать: `source_qualities` — не HDRip/WEB-DL.

## Озвучки (`available_voices`)

Объект голоса:

| Поле | Тип | Описание |
|------|-----|----------|
| `studio_code` | string | Код студии |
| `studio_name` | string | Название студии |
| `language` | string | Язык |
| `voice_type` | string | Тип озвучки (код) |
| `voice_type_label` | string | Подпись типа |
| `created_at` | string | Дата появления |

Для фильмов и сериалов поле **всегда присутствует**; пустой массив = «озвучек нет», а не «поле опущено».

## Связанные разделы

| Файл | Содержание |
|------|------------|
| [titles.md](./titles.md) | Фильтры, поиск, карточка, restricted |
| [seasons-episodes.md](./seasons-episodes.md) | Сезоны и серии |
| [references.md](./references.md) | Страны, жанры, студии |
| [openapi-v0.1.0.json](./openapi-v0.1.0.json) | Сырой OpenAPI 2.0 снимок |
