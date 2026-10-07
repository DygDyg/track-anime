# Сезоны и эпизоды

> Источник: Content API Swagger → теги «Сезоны», «Эпизоды»

Все запросы требуют `Authorization: Bearer <token>`.

Базовый префикс: `https://public-api.cdnvideohub.com`.

---

## `GET /api/v1/titles/{title_id}/seasons` — сезоны тайтла

Список сезонов с курсорной пагинацией.

> В карточке `GET /titles/{title_id}` при `is_series=true` поле `seasons` отдаёт **ту же** структуру `SeasonSummary` **целиком** (без пагинации). Этот эндпоинт — для постраничной выборки.

### Path / query

| Имя | Где | Описание |
|-----|-----|----------|
| `title_id` | path | ID тайтла |
| `cursor` | query | Курсор |
| `limit` | query | `1`–`100`, default `20` |

### Ответ `200` — `SeasonList`

```json
{
  "items": [ /* SeasonSummary */ ],
  "has_more": false,
  "next_cursor": ""
}
```

### `SeasonSummary`

| Поле | Тип | Описание |
|------|-----|----------|
| `number` | string | Номер сезона |
| `name` | string | Название сезона |
| `year` | integer | Год |
| `episodes_count` | integer | Заявленное число эпизодов |
| `available_episodes_count` | integer | Сколько эпизодов реально доступно |

### Ошибки

`400`, `401`, `404`, `500`.

### Пример

```http
GET /api/v1/titles/abc123/seasons?limit=50
Authorization: Bearer <token>
```

---

## `GET /api/v1/titles/{title_id}/seasons/{season_number}/episodes` — эпизоды сезона

Список эпизодов сезона с курсорной пагинацией.

### Path / query

| Имя | Где | Описание |
|-----|-----|----------|
| `title_id` | path | ID тайтла |
| `season_number` | path | Номер сезона (как в `SeasonSummary.number`) |
| `cursor` | query | Курсор |
| `limit` | query | `1`–`100`, default `20` |

### Ответ `200` — `EpisodeList`

```json
{
  "items": [ /* EpisodeDetail */ ],
  "has_more": true,
  "next_cursor": "..."
}
```

### `EpisodeDetail`

| Поле | Тип | Описание |
|------|-----|----------|
| `number` | string | Номер эпизода |
| `name` | string | Название |
| `air_date` | string | Дата выхода |
| `duration` | integer | Длительность |
| `thumbnail_url` | string | Превью |
| `available_voices` | VoiceInfo[] | Доступные озвучки эпизода |
| `source_qualities` | string[] | Разрешения (`1080p`, `720p`, …), лучшее первым |
| `source_types` | SourceTypeInfo[] | Типы релиза (`code` + `label`) |

### `VoiceInfo` (на эпизоде)

| Поле | Тип |
|------|-----|
| `studio_code` | string |
| `studio_name` | string |
| `language` | string |
| `voice_type` | string |
| `voice_type_label` | string |
| `created_at` | string |

### `SourceTypeInfo`

| Поле | Тип | Пример |
|------|-----|--------|
| `code` | string | стабильный код типа релиза |
| `label` | string | `WEB-DL`, `BD-Rip`, `CAMRip`, … |

### Ошибки

`400`, `401`, `404`, `500`.

### Пример

```http
GET /api/v1/titles/abc123/seasons/1/episodes?limit=100
Authorization: Bearer <token>
```

---

## Замечания по данным

1. **`number` у сезона и эпизода — string**, не integer (в спецификации так).
2. Content API описывает **метаданные** доступности (качества, озвучки, превью). Прямых URL стримов (HLS/DASH/MP4) в этих ответах **нет**.
3. Для сериала удобно сначала взять `seasons` из карточки тайтла, затем догружать эпизоды по сезонам этим эндпоинтом.
