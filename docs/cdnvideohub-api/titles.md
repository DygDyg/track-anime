# Тайтлы

> Источник: Content API Swagger → тег «Тайтлы»

Все запросы требуют `Authorization: Bearer <token>`.

Базовый префикс: `https://public-api.cdnvideohub.com`.

---

## `GET /api/v1/titles` — список тайтлов

Список с фильтрами и курсорной пагинацией.

> Параметр-идентификатор (`id`, `kinopoisk_id`, `imdb_id`, `mal_id`, `mdl_id`), присланный **пустым или из одних пробелов**, отклоняется **`400`** (вместо выдачи всего каталога).

### Параметры query

| Имя | Тип | По умолчанию | Описание |
|-----|-----|--------------|----------|
| `type` | enum | — | `movie` \| `tv` |
| `id` | string | — | ID тайтлов через запятую |
| `genres` | string | — | **Коды** жанров через запятую (OR). Берите из `/genres` (`code`). Имена из `/titles/filters` **не** работают |
| `countries` | string | — | **Коды** стран через запятую (OR). Берите из `/countries` (`code`) |
| `direction` | enum | — | `anime` \| `dorama` \| `turkey` \| `west` |
| `sort` | enum | `created_at_desc` | См. таблицу сортировок |
| `cursor` | string | — | Курсор пагинации |
| `limit` | int | `20` | `1`–`100` |
| `updated_since` | string | — | RFC3339; только изменённые после даты |
| `year_from` | int | — | Год от (`1900`–`2100`) |
| `year_to` | int | — | Год до (`1900`–`2100`) |
| `rating_from` | number | — | Рейтинг от (`0`–`10`) |
| `rating_to` | number | — | Рейтинг до (`0`–`10`) |
| `kinopoisk_id` | string | — | Точное совпадение → в ответе `external_ids.kp` |
| `imdb_id` | string | — | Точное совпадение **без** `tt` → `external_ids.imdb` |
| `mal_id` | string | — | Точное совпадение → `external_ids.mal` |
| `mdl_id` | string | — | Точное совпадение → `external_ids.mdl` |
| `licensed` | boolean | — | `true` — только лицензионные; `false` — только нелицензионные; без параметра — все |
| `with_count` | boolean | — | Добавить `total` в ответ |

### Сортировка (`sort`)

| Значение | Описание |
|----------|----------|
| `created_at_desc` | По дате создания ↓ (default) |
| `created_at_asc` | По дате создания ↑ |
| `updated_at_desc` | По дате обновления ↓ |
| `updated_at_asc` | По дате обновления ↑ — для инкрементальной синхронизации с `updated_since` |
| `year_desc` / `year_asc` | По году |
| `name_asc` / `name_desc` | По названию |

### Ответ `200` — `TitleList`

```json
{
  "items": [ /* TitleItem */ ],
  "has_more": true,
  "next_cursor": "...",
  "total": 12345
}
```

`total` появляется только при `with_count=true`.

### `TitleItem`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | ID тайтла |
| `name` | string | Название |
| `type` | string | Тип |
| `is_series` | boolean | Сериал |
| `year` | integer | Год |
| `poster_url` | string | Постер |
| `licensed` | boolean | Лицензия |
| `kinopoisk_rating` | number | Рейтинг КП |
| `imdb_rating` | number | Рейтинг IMDb |
| `tags` | string[] | Теги |
| `external_ids` | object\<string,string\> | Внешние ID: ключи `kp`, `imdb`, `mal`, `mdl` |
| `created_at` | string | Создан |
| `updated_at` | string | Обновлён |

### Ошибки

`400`, `401`, `500` — стандартный `ErrorResponse`.

### Пример

```http
GET /api/v1/titles?direction=anime&type=tv&sort=updated_at_asc&updated_since=2026-01-01T00:00:00Z&limit=50
Authorization: Bearer <token>
```

---

## `GET /api/v1/titles/filters` — доступные фильтры

Swagger обещает «коды» для `/titles`. **На практике (live)** массивы `countries` / `genres` — это **человекочитаемые названия** (как в UI), а не `code` из справочников.

Для query `genres=` / `countries=` используйте коды из `/genres` и `/countries`.

### Ответ `200` — `TitleFilters`

| Поле | Тип | Описание |
|------|-----|----------|
| `countries` | string[] | Названия стран (live), не ISO-коды |
| `genres` | string[] | Названия жанров (live), не `action`/`anime` |
| `tags` | string[] | Теги (может быть пустым) |
| `years` | object | `{ "min": number, "max": number }` (live: `min` может быть `0`) |

Ошибки: `401`, `500`.

---

## `GET /api/v1/titles/search` — поиск

Поиск по текстовому запросу.

### Параметры

| Имя | Обязательный | Описание |
|-----|--------------|----------|
| `q` | да | Поисковая строка |
| `limit` | нет | `1`–`100`, default `20` |

### Ответ `200` — `TitleSearch`

```json
{
  "items": [ /* TitleItem */ ]
}
```

Пагинации/курсора нет — только `items` до `limit`.

Ошибки: `400`, `401`, `500`.

### Пример

```http
GET /api/v1/titles/search?q=Наруто&limit=10
Authorization: Bearer <token>
```

---

## `GET /api/v1/titles/restricted` — реестр ограниченных

Тайтлы с метками ограничений (`lgbt` / `licensed`), чтобы скрыть или особо обработать на своей стороне.

> В обычную выдачу `/titles` они **не попадают**.

Для инкрементальной синхронизации передавайте `updated_since`.

### Параметры

| Имя | Тип | Описание |
|-----|-----|----------|
| `marker` | enum | Только одна метка: `lgbt` \| `licensed` |
| `updated_since` | string | RFC3339 |
| `cursor` | string | Курсор |
| `limit` | int | `1`–`100`, default `20` |

### Ответ `200` — `RestrictedTitleList`

Структура пагинации как у списка: `items`, `has_more`, `next_cursor`.

### `RestrictedTitleItem`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | ID |
| `name` | string | Название |
| `type` | string | Тип |
| `year` | integer | Год |
| `lgbt` | boolean | Метка LGBT |
| `licensed` | boolean | Метка лицензии |
| `external_ids` | object | Внешние ID |
| `updated_at` | string | Обновлён |

Ошибки: `400`, `401`, `500`.

---

## `GET /api/v1/titles/{title_id}` — карточка тайтла

Полная информация о тайтле.

### Path

| Имя | Описание |
|-----|----------|
| `title_id` | ID тайтла |

### Ответ `200` — `TitleDetail`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | ID |
| `name` | string | Название |
| `english_name` | string | Английское название |
| `original_name` | string | Оригинальное название |
| `alternative_names` | string[] | Альтернативные названия |
| `type` | string | Тип |
| `is_series` | boolean | Сериал |
| `year` | integer | Год начала |
| `year_end` | integer | Год окончания |
| `premiere_date` | string \| null | Самая ранняя полная дата премьеры `YYYY-MM-DD`; без year-only fallback |
| `description` | string | Описание |
| `short_description` | string | Краткое описание |
| `duration` | integer | Длительность (мин.) |
| `poster_url` | string | Постер |
| `backdrop_url` | string | Backdrop |
| `licensed` | boolean | Лицензия |
| `kinopoisk_rating` | number | Рейтинг КП |
| `imdb_rating` | number | Рейтинг IMDb |
| `genres` | string[] | Названия жанров (для UI) |
| `genre_codes` | string[] | Коды жанров 1:1 с `genres`, без схлопывания по имени |
| `countries` | string[] | Названия стран |
| `country_codes` | string[] | Коды стран 1:1 с `countries` |
| `studios` | string[] | Студии |
| `voice_studios` | string[] | Студии озвучки |
| `tags` | string[] | Теги |
| `external_ids` | object | Внешние ID |
| `available_voices` | VoiceInfo[] | Озвучки (всегда есть; `[]` = нет озвучек) |
| `source_qualities` | string[] | Разрешения, лучшее первым (`1080p`, …) |
| `source_types` | SourceTypeInfo[] | Типы релиза (`code` + `label`) |
| `crew` | CrewMember[] | Съёмочная группа / авторы |
| `seasons_count` | integer | Число сезонов |
| `seasons` | SeasonSummary[] | Только при `is_series=true`; полная разбивка без пагинации (тот же shape, что `/seasons`) |
| `created_at` | string | Создан |

### `CrewMember`

| Поле | Тип |
|------|-----|
| `person_name` | string |
| `role` | string |
| `external_ids` | object\<string,string\> |

### `SourceTypeInfo`

| Поле | Тип |
|------|-----|
| `code` | string |
| `label` | string |

### Ошибки

`401`, `404`, `500`.

### Пример

```http
GET /api/v1/titles/abc123
Authorization: Bearer <token>
```

---

## Рекомендуемый поток интеграции каталога

1. Один раз / периодически: `/countries`, `/genres`, `/studios`, `/titles/filters`.
2. Полный дамп или инкремент: `/titles` с `sort=updated_at_asc` (+ `updated_since`).
3. Параллельно синхронизировать `/titles/restricted` (скрытые из обычной выдачи).
4. По `id` или внешним ID — `/titles/{id}` для карточки.
5. Для сериалов — `/titles/{id}/seasons` и `.../episodes` (или `seasons` из карточки).

Поиск для UI: `/titles/search?q=...`.
