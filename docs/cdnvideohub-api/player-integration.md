# CDN VideoHub — интеграция плеера на сайт

> Как подключить **готовый плеер** (и чем он отличается от Content API).  
> Источники: [cdnvideohub.com](https://cdnvideohub.com/), live `player.cdnvideohub.com` / `plapi.cdnvideohub.com`, публичные партнёрские встраивания (разметка `<video-player>`), снимок player JS `s2/stable/video-player.umd.js`.

Связанные разделы каталога: [README](./README.md) · [overview](./overview.md) · [titles](./titles.md).

---

## Конфиг Track Anime

| Параметр | Значение |
|----------|----------|
| Домен | `track-anime.dygdyg.ru` |
| `pub` (`data-publisher-id`) | `10326` |

Проверено live (2026-09-15): playlist с `pub=10326` отвечает `200` для `aggr=kp`, `mal`, `mali`, `cvh`, **`shikimori`**.
`aggr=shiki` / `shk` — по-прежнему `503`.

В Track Anime резолв плейлиста: сначала `aggr=shikimori` + `shikimoriId`, если пусто — `aggr=mal|mali` + MAL ID.

Официальные агрегаторы виджета (Partners): **`kp`**, **`mali`**, **`mdl`**. Для аниме в виджете предпочитать **`mali`**, не `mal`.

**Запрет iframe:** в [официальной установке плеера](./player-setup-partners.md) внешний iframe запрещён (ломает статистику). В TA VideoHUB по умолчанию **inline** `<video-player>` (`CvhPlayerFrame`).

Полный список DOM-событий (`currentTime`, `changeState`, …) и методов (`selectSeason` / `selectEpisode`) — в **[player-setup-partners.md](./player-setup-partners.md)**.

Для TA предпочтительный маппинг ID:

1. plapi / виджет: сначала `aggr=shikimori` + Shikimori ID
2. иначе `aggr=mali|mal` + `Anime.malId`
3. иначе `aggr=kp` + kinopoisk id (если появится в данных)
4. иначе Content API UUID + plapi `aggr=cvh` (каталог)

Пример виджета под этот `pub` (inline, как требует Partners):

```html
<script async src="https://player.cdnvideohub.com/s2/stable/video-player.umd.js"></script>
<video-player
  id="pcvh"
  ident="cvh"
  data-title-id="1"
  data-publisher-id="10326"
  data-aggregator="mali"
  episode="1"
  season="1"
  priority-voice="Dream Cast"
></video-player>
```

---

## Два слоя API

| Слой | Хост | Auth | Назначение |
|------|------|------|------------|
| **Content API** | `public-api.cdnvideohub.com` | Bearer JWT | Каталог: тайтлы, сезоны, эпизоды, метаданные |
| **Player / plapi** | `plapi.cdnvideohub.com` | **без** Bearer (в публичных вызовах) | Плейлист серий/озвучек + URL потоков + VAST |

Плеер на сайте — это в первую очередь **Player-слой** + виджет с `player.cdnvideohub.com`. Content API удобен для своей карточки/поиска; `id` тайтла из Content API можно отдать в playlist с `aggr=cvh` (проверено live).

Официальный путь партнёра (с монетизацией): заявка → менеджер → ЛК → `pub` / модуль DLE / код встраивания. Условия с лендинга: трафик от ~2000 уников/сутки, доступ в метрику, их плеер на первом месте. Контакты: `@CVHsupportBot`, `partner@cdnvideohub.com`.  
Карта ЛК и FAQ: [partners-portal.md](./partners-portal.md). DLE: [dle-module.md](./dle-module.md).

---

## Рекомендуемый способ: виджет `<video-player>`

Партнёрская страница (часто путь вида `/cdn-iframe/{titleId}/{voice}/{season}/{episode}` на **вашем** домене) подключает UMD и кастомный элемент.

### Минимальный embed

```html
<video-player
  id="pcvh"
  ident="cvh"
  data-title-id="51019"
  data-publisher-id="747"
  data-aggregator="mali"
  episode="3"
  priority-voice="AnilibriaTV"
  is-show-voice-only="true"
></video-player>

<script src="https://player.cdnvideohub.com/s2/stable/video-player.umd.js"></script>
```

Внутри виджет поднимает shadow DOM и iframe фрейма плеера (`…/s2/v2.x.x/frame`), сам ходит в plapi.

### Атрибуты (по live-разметке партнёров)

| Атрибут | Пример | Смысл |
|---------|--------|--------|
| `id` | `pcvh` | DOM id (часто `#pcvh`) |
| `ident` | `cvh` | Идентификатор балансера/плеера |
| `data-title-id` | `51019` / UUID / kp id | ID тайтла **в системе агрегатора** `aggr` |
| `data-publisher-id` | `747` | Ваш **`pub`** из ЛК (монетизация/учёт) |
| `data-aggregator` | `mali`, `kp`, `mal`, `cvh`, … | Какой словарь ID использовать |
| `episode` | `3` | Номер серии |
| `priority-voice` | `AnilibriaTV` | Предпочтительная озвучка |
| `is-show-voice-only` | `true` | UI: только выбор озвучки |

Точные значения `pub` и `aggr` выдаёт CDN VideoHub при подключении сайта. Чужие `pub` на проде не используйте — реклама/статистика уйдут не вам.

### Вставка через iframe

На форумах интеграторов подтверждают: на странице тайтла плеер обычно в **`iframe`** (или lazy-load iframe), `src` = URL вашей страницы с виджетом (например `/cdn-iframe/...`), а не «голый» mp4.

```html
<iframe
  src="/cdn-iframe/51019/AnilibriaTV/1/3"
  width="100%"
  height="480"
  frameborder="0"
  allowfullscreen
  allow="autoplay *; fullscreen *; encrypted-media *"
></iframe>
```

DLE-модуль: официальная дока в ЛК — [dle-module.md](./dle-module.md) (для Next.js TA не нужен).

---

## Связь с parent-страницей

Партнёрская дока описывает **DOM-события на самом `<video-player>`**, а не Kodik-style `postMessage` API.  
Полный контракт: [player-setup-partners.md](./player-setup-partners.md).

Кратко для прогресса / UI сайта:

| Нужно | Partners |
|-------|----------|
| Позиция | `currentTime` → `e.detail.time` |
| Play/pause | `changeState` → `playing` / `paused` / `stopped` |
| Конец серии | `playComplete` |
| Смена серии (авто) | `episodeChange` (ручной UI виджета — нет; читать `player.state`) |
| Перейти на серию | `selectEpisode(n)` / `selectSeason(n)` |
| Seek | **не документирован** |

Ранние наблюдения по бандлу / пробросу `source: 'cdnvideohub-player'` сохраняются как дополнение, но приоритет — Partners.

---

## Player API (для кастомного UI / своего плеера)

База: `https://plapi.cdnvideohub.com`

Виджет внутри использует те же методы (`playerSvPlaylistGet`, `playerSvVideoVkIdGet`).

### 1) Плейлист

```http
GET /api/v1/player/sv/playlist?pub={pub}&aggr={aggr}&id={id}
```

| Параметр | Описание |
|----------|----------|
| `pub` | Publisher ID (партнёр) |
| `aggr` | Агрегатор идентификаторов |
| `id` | ID тайтла в словаре `aggr` |

#### Известные `aggr` (live)

| `aggr` | Что передавать в `id` | Пример |
|--------|------------------------|--------|
| `shikimori` | ID Shikimori | `51009` |
| `kp` | Кинопоиск | `841279` |
| `mal` | MyAnimeList | `34566` |
| `mali` | MyAnimeList (виджет Partners) / иногда ID площадки | `51019` |
| `cvh` | UUID тайтла Content API | `01915291-ace9-72c2-8b7a-dbd83b366618` |

Пустой/неверный результат: HTTP `204` без тела (наблюдалось для `aggr=kp` + UUID).

#### Ответ (схема)

```json
{
  "titleName": "…",
  "isSerial": true,
  "items": [
    {
      "cvhId": "01915291-ace9-72c2-8b7a-dbd83a608b0a",
      "vkId": "7584668342890",
      "voiceStudio": "Dream Cast",
      "voiceType": "Неизвестный",
      "season": 2,
      "episode": 1
    }
  ],
  "trailers": null,
  "ads": { "vast": { /* preroll / pauseroll / … */ } },
  "vast": { /* дублирует ads.vast */ },
  "tags": [1, 3]
}
```

| Поле ответа | Смысл |
|-------------|--------|
| `tags` | Числовые метки ограничений (см. ниже); может отсутствовать |

| Поле item | Смысл |
|-----------|--------|
| `cvhId` | ID единицы контента CVH (связан с каталогом) |
| `vkId` | ID для запроса потоков (`/video/{vkId}`) |
| `voiceStudio` / `voiceType` | Озвучка |
| `season` / `episode` | Числа (в Content API номера часто string) |

#### `tags` (ограничения)

Коды из enum виджета `video-player.umd.js` (проверено в бандле):

| Код | Имя | UI в TA |
|-----|-----|---------|
| `1` | Licensed | «Лицензия» |
| `3` | LGBT | «ЛГБТ» |
| `5` | Blocked | «Недоступно в РФ» |

На полностью заблокированных тайтлах plapi часто отдаёт только `[5]` и пустой `items` (детальные `lgbt`/`licensed` из ЛК — в Content API `/titles/restricted`).

**UI на странице аниме:** плейлист plapi резолвится **в браузере** (`resolveCvhPlaylistForAnime` в `cvh-player.ts`: CORS `Access-Control-Allow-Origin: https://track-anime.win`). Сначала `aggr=shikimori` + id, иначе MAL. Над виджетом — полоска серий (как Kodik beta), снизу — озвучки (как TA). Прогресс и `kodikId` сопоставленной озвучки пишутся в watch-history; «Продолжить» → TA (нет seek в CVH API). Серверный `/api/anime/[id]/cvh` опционален (на VPS исходящий plapi часто timeout).

В ответе уже лежат **VAST**-теги рекламы (AdFox/Яндекс и т.п.) — это основа монетизации готового плеера.

### 2) Потоки серии / файла

```http
GET /api/v1/player/sv/video/{vkId}
Origin: https://player.cdnvideohub.com
Referer: https://player.cdnvideohub.com/
```

#### Ответ (схема)

```json
{
  "unitedVideoId": 7584668342890,
  "duration": 1428,
  "failoverHost": "vd….okcdn.ru",
  "thumbUrl": "https://iv.okcdn.ru/…",
  "sources": {
    "hlsUrl": "https://vd….okcdn.ru/video.m3u8?…",
    "dashUrl": "https://vd….okcdn.ru/?…",
    "mpegFullHdUrl": "…",
    "mpegHighUrl": "…",
    "mpegMediumUrl": "…",
    "mpegLowUrl": "…",
    "mpegLowestUrl": "…",
    "mpegTinyUrl": "…",
    "mpegQhdUrl": "",
    "mpeg2kUrl": "",
    "mpeg4kUrl": ""
  }
}
```

#### Качества MP4 (ориентир)

| Поле | Качество |
|------|----------|
| `mpegTinyUrl` | ~144p |
| `mpegLowestUrl` | ~240p |
| `mpegLowUrl` | ~360p |
| `mpegMediumUrl` | ~480p |
| `mpegHighUrl` | ~720p |
| `mpegFullHdUrl` | ~1080p |
| `mpegQhdUrl` / `mpeg2kUrl` / `mpeg4kUrl` | выше, часто пустые |

CDN потоков — инфраструктура OK (`*.okcdn.ru`). Ссылки **подписаны и привязаны к IP/времени** (`expires`, `srcIp`, `sig`).

#### CORS

`Access-Control-Allow-Origin` у `/video/{vkId}` — **`https://player.cdnvideohub.com`**.  
Браузерный JS с вашего домена **напрямую** plapi video не вызовет. Варианты:

1. Официальный виджет (рекомендуется) — Origin плеера свой.
2. Серверный proxy на вашем бэкенде (с учётом ToS/договора и рекламы).
3. Не использовать raw streams на клиенте без согласования с CVH.

---

## Типовые сценарии интеграции

### A. Только готовый плеер + монетизация (партнёр)

1. Заключить подключение, получить `pub`, домен в ЛК.
2. На сайте страница/роут iframe с `<video-player>` + `video-player.umd.js`.
3. `data-title-id` мапить с вашей БД: через `aggr=kp|mal|mali|cvh`.
4. Для каталога на сайте — Content API (`Bearer`) или своя выдача.

### B. Свой UI серий/озвучек + их виджет

1. Content API или `/playlist` → список сезонов/эпизодов/студий.
2. При выборе серии обновлять атрибуты `episode` / `priority-voice` или пересоздавать элемент / менять `src` iframe.
3. Воспроизведение оставить виджету (реклама + DRM/CDN-политики).

### C. Полностью свой видеоплеер (HLS.js / Video.js)

1. Server-side: `playlist` → выбрать item → `video/{vkId}`.
2. Отдать клиенту только то, что разрешено договором (часто — только через их плеер).
3. Учесть VAST из playlist, короткие TTL ссылок, CORS, Referer/Origin на стримы.

Для Track Anime-подобных проектов обычно ближе **A/B** (iframe/виджет), а не вынос raw OKCDN на клиент.

---

## Связка Content API ↔ Player

| Content API | Player |
|-------------|--------|
| `GET /titles?kinopoisk_id=` → `external_ids.kp` | `playlist?aggr=kp&id={kp}` |
| `GET /titles?mal_id=` → `external_ids.mal` | `playlist?aggr=mal&id={mal}` |
| `TitleDetail.id` (UUID) | `playlist?aggr=cvh&id={uuid}` |
| `EpisodeDetail` + voices | `items[].episode/season/voiceStudio` |
| Нет stream URL | `sources.*` в `/video/{vkId}` |

`items[].cvhId` — UUID-подобные id контента CVH (могут отличаться от `title_id` карточки: эпизод vs тайтл).

---

## Что проверить перед продом

- [ ] Свой `pub` и домен в ЛК CVH  
- [ ] Правильный `aggr` под ваши ID (не чужой `mali`, если у вас только KP/MAL)  
- [ ] CSP: разрешить `player.cdnvideohub.com`, `plapi.cdnvideohub.com`, при необходимости `*.okcdn.ru` / рекламные домены  
- [ ] `iframe` + `allowfullscreen` / `allow`  
- [ ] Обработка `noData` / пустого playlist  
- [ ] Реклама не вырезана (условие партнёрки)  
- [ ] Не светить Bearer Content API в браузере — только server-side  

---

## Ограничения документации

- Отдельного публичного Swagger для **Player API** нет (в отличие от Content API `doc.json`).
- Точный список `postMessage` / DOM-событий виджета официально не зафиксирован — ниже описано по live JS/партнёрским страницам (`НЕ ПОЛНЫЙ КОНТРАКТ`).
- Корневой `https://player.cdnvideohub.com/` может отдавать заглушку хостинга; рабочий артефакт — **`/s2/stable/video-player.umd.js`** и frame под `/s2/v…/frame`.

---

## Краткая шпаргалка URL

```
# виджет
https://player.cdnvideohub.com/s2/stable/video-player.umd.js

# плейлист
GET https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=PUB&aggr=AGGR&id=ID

# потоки
GET https://plapi.cdnvideohub.com/api/v1/player/sv/video/{vkId}

# каталог
GET https://public-api.cdnvideohub.com/api/v1/titles/...
Authorization: Bearer <token>
```
