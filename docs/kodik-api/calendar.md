# Kodik calendar dump

> Источник проверен по `https://dumps.kodikres.com/calendar.json?token=...`.
> Токен передаётся только на сервере и не должен попадать в клиентский код, логи UI или публичные ссылки.

## GET /calendar.json

Возвращает календарь ближайших выходов из базы Kodik/Shikimori. Формат близок к `GET /api/calendar` Shikimori, но endpoint находится на dump-домене Kodik и требует `token` query parameter.

```bash
GET https://dumps.kodikres.com/calendar.json?token=...
```

### Пример записи

```json
{
  "next_episode": 2,
  "next_episode_at": "2026-07-13T11:57:00Z",
  "duration": 23,
  "anime": {
    "id": "56736",
    "name": "Saikyou Degarashi Ouji no Anyaku Teii Arasoi",
    "russian": "Тайная битва за престол сильнейшего принца-дуралея",
    "image": {
      "original": "https://shikimori.io/uploads/poster/animes/56736/...",
      "preview": "https://shikimori.io/uploads/poster/animes/56736/...",
      "x96": "https://shikimori.io/uploads/poster/animes/56736/...",
      "x48": "https://shikimori.io/uploads/poster/animes/56736/...",
      "x24": "https://shikimori.io/uploads/poster/animes/56736/..."
    }
  },
  "kind": "tv",
  "score": 6.56,
  "status": "ongoing",
  "episodes": 12,
  "episodes_aired": 1,
  "aired_on": "2026-07-06",
  "released_on": null
}
```

### Поля записи

| Поле | Тип | Описание |
|------|-----|----------|
| `next_episode` | number | Номер следующей серии |
| `next_episode_at` | string | Дата/время выхода в ISO 8601 UTC (`Z`) |
| `duration` | number | Длительность серии в минутах; может быть `0`, если неизвестна |
| `anime.id` | string | Shikimori ID; для Track Anime нужно парсить в number |
| `anime.name` | string | Оригинальное/ромадзи название |
| `anime.russian` | string | Русское название |
| `anime.image` | object | Постеры Shikimori (`original`, `preview`, `x96`, `x48`, `x24`) |
| `kind` | string | Тип Shikimori (`tv`, `movie`, `ona`, ...) |
| `score` | number | Оценка Shikimori числом |
| `status` | string | Статус Shikimori; в выдаче встречаются `ongoing` и `anons` |
| `episodes` | number | Всего серий, `0` если неизвестно |
| `episodes_aired` | number | Уже вышло серий |
| `aired_on` | string \| null | Дата начала показа |
| `released_on` | string \| null | Дата завершения |

## Применение на track-anime

Kodik calendar dump можно использовать как альтернативный источник расписания для вкладки «Онгоинги» календаря:

1. Серверный клиент получает dump с `KODIK_API_TOKEN`.
2. Ответ нормализуется в существующий `CalendarItem`:
   - `shikimoriId = Number(anime.id)`;
   - `animeTitle = anime.russian || anime.name`;
   - `posterUrl = anime.image.preview || anime.image.original`;
   - `episodeNumber = next_episode`;
   - `scheduleAt = new Date(next_episode_at)`;
   - `scheduleSource = "next_episode"`;
   - `translationName = "Shikimori"`;
   - `playerLink = null`.
3. Для тайтлов, которые уже есть в локальной Kodik БД, данные плеера/озвучки можно обогащать через `KodikMaterial` по `shikimoriId`.
4. Результат группируется тем же `groupCalendarByDay()`, что и текущий календарь.

### Рекомендуемая схема кэширования

| Уровень | Что кэшировать | TTL / invalidation |
|---------|----------------|--------------------|
| In-memory / `unstable_cache` | Нормализованный список `CalendarItem[]` | 5 минут, tag `calendar` |
| PostgreSQL, опционально | Последний успешный сырой/нормализованный dump | 30-60 минут или до следующего успешного fetch |
| UI page | `getCalendarPageData()` | Уже кэшируется на 5 минут |

Если внешний dump временно недоступен, календарь должен отдавать последний успешный PostgreSQL-кэш или падать обратно на текущий локальный Kodik-source.

## Сравнение с Shikimori calendar

| Источник | Плюсы | Минусы |
|----------|-------|--------|
| Shikimori `/api/calendar` | Официальный API расписания, без Kodik-токена | Нет Kodik-плеера/озвучек |
| Kodik dump `calendar.json` | Готовый календарь из базы Kodik/Shikimori, содержит постеры и статусы | Требует Kodik token; `anime.id` приходит строкой; нет playerLink |
| Локальная Kodik БД | Можно обогащать плеером, озвучкой, скриншотами | Зависит от качества import/sync и `materialData.next_episode_at` |

Для Track Anime безопасный вариант: оставить текущий локальный Kodik calendar как основной, добавить Shikimori/Kodik dump как альтернативный серверный source и переключать источник до группировки, не меняя клиентские карточки.

## Связанные разделы

- [list.md](./list.md)
- [material_data.md](./material_data.md)
- [../shikimori-api/calendar.md](../shikimori-api/calendar.md)
