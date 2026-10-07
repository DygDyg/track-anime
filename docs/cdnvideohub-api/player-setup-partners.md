# CDN VideoHub — установка плеера (Partners)

> Источник: [partners.cdnvideohub.com/docs/player-setup](https://partners.cdnvideohub.com/docs/player-setup)  
> Снимок сохранённой страницы партнёра (CVH Partners v1.0.0, «Установка плеера»).  
> Связано: [player-integration.md](./player-integration.md) · Content API → [overview.md](./overview.md)

Официальное руководство для партнёров: встраивание `<video-player>`, параметры, **DOM-события** и методы.

---

## Важно для Track Anime

1. **iframe запрещён** официально: «При использовании iframe происходит некорректный подсчет статистики.»  
   Виджет нужно монтировать **inline** на странице (скрипт + `<video-player>`).  
   В TA по умолчанию **inline** (`CvhPlayerFrame`); `/cdn-iframe` — только запасной shell.

2. Официальные агрегаторы в виджете: **`kp`**, **`mali`** (MyAnimeList), **`mdl`**.  
   В plapi также отвечает `mal` / `cvh` (проверено отдельно) — для виджета ориентироваться на **`mali`**.

3. Для «Продолжить» / прогресса: есть событие **`currentTime`** (~4 раз/сек) и **`changeState`**.  
   В официальных **методах** пока только `selectSeason` / `selectEpisode` — **seek по секундам в доке нет**.  
   Continue на серию — да; continue с таймкода — только если появится метод seek или недокументированный API.

---

## 1. Размещение скрипта

```html
<script async src="https://player.cdnvideohub.com/s2/stable/video-player.umd.js"></script>
```

## 2. Использование

```html
<video-player
  id="myPlayer"
  data-title-id="460586"
  data-publisher-id="0123456789"
  ident="player_1"
  data-aggregator="kp"
  is-show-voice-only="false"
  is-show-banner="false"
  season="1"
  episode="1"
  only-voice="jaskier"
  priority-voice="Jaskier"
  disable-licensed="false"
></video-player>
```

`data-publisher-id` — персональный partner ID (для TA: `10326`).

## 3. Стилизация

`<video-player>` тянется на **100% × 100%** родителя. Размеры задаёт сайт:

```html
<div class="player">
  <video-player …></video-player>
</div>
```

```css
.player {
  width: 600px;
  height: 500px;
}
@media (max-width: 768px) {
  .player { width: 400px; height: 300px; }
}
@media (max-width: 425px) {
  .player { width: 300px; height: 200px; }
}
```

---

## 4. Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `data-publisher-id` | **обязательный** | Partner ID |
| `data-title-id` | **обязательный** | ID тайтла в словаре агрегатора |
| `data-aggregator` | **обязательный** | `kp` — Кинопоиск; `mali` — MyAnimeList (аниме); `mdl` — MyDramaList (дорамы) |
| `ident` | опционально | Уникальное имя при нескольких плеерах на странице |
| `is-show-voice-only` | опционально | `true` — только выбор озвучек; `false` — по умолчанию |
| `is-show-banner` | опционально | `true` — картинка серии (default); `false` — чёрный экран + play |
| `only-voice` | опционально | Код студии из ЛК; если задан, **`priority-voice` не сработает** |
| `priority-voice` | опционально | Приоритетная озвучка (имя); иначе озвучка по умолчанию |
| `disable-licensed` | опционально | `true` — не скрывать контент по тегам лицензии; default `false` |
| `season` | опционально | Номер сезона |
| `episode` | опционально | Номер эпизода (без сезона — в сезоне по умолчанию) |

---

## 5. События (DOM CustomEvent)

Слушать на элементе `#myPlayer` через `addEventListener`. Данные — в `e.detail`.

### Жизненный цикл

```
ready → init → playStart → changeState("playing") → … → playComplete
```

| Событие | `e.detail` | Описание |
|---------|------------|----------|
| `ready` | — | Плеер готов к командам |
| `init` | — | Данные видео загружены |
| `noData` | — | Ошибка получения данных |
| `error` | `{ errorCode: number, message: string }` | Ошибка воспроизведения / инициализации |
| `playStart` | — | Первый старт видео |
| `playComplete` | — | Видео закончилось |
| `changeState` | `{ state: "playing" \| "paused" \| "stopped" }` | Состояние плеера |
| `currentTime` | `{ time: number }` | Позиция в секундах (~**4 раза/сек**; не делать тяжёлую работу в хендлере) |
| `durationChange` | `{ duration: number }` | Длительность, сек |
| `volumeChange` | `{ volume: number, muted: boolean }` | Громкость 0–1 и mute |
| `qualityList` | `{ list: number[] }` | Доступные высоты, напр. `[360,480,720,1080]` |
| `currentQuality` | `{ quality: { height, quality, isAutoQuality } }` | Текущее качество |
| `buffering` | `{ range: { start, end }[] }` | Буферные диапазоны (сек) |
| `adRequest` | `{ aformat: "preroll" \| "midroll" \| "pauseroll" }` | Запрос рекламы |
| `adStart` | `{ aformat }` | Старт рекламы |
| `adEnd` | `{ aformat }` | Конец рекламы |
| `rollState` | `{ type: string, state: "start" \| "complete" \| "skip" }` | Состояние рекламного блока |
| `episodeChange` | см. ниже | **Только** автопереход на следующую серию (после ~7 с countdown). Ручной выбор серии / next-prev внутри виджета это событие **не** шлёт |

### `episodeChange`

```js
player.addEventListener("episodeChange", (e) => {
  const { seasonNumber, episodeNumber, episodeTitle, voiceName } = e.detail;
});
```

| Поле | Тип |
|------|-----|
| `seasonNumber` | number |
| `episodeNumber` | number |
| `episodeTitle` | string |
| `voiceName` | string |

**Track Anime:** полоска серий и `UserWatchProgress` синхронизируются ещё и с `player.state.currentSeason/currentEpisode` (на `currentTime` / `playStart` / повторном `init`), потому что ручная смена серии в UI виджета не даёт `episodeChange`. Повторный `init`/`ready` при смене медиа не должен заново «навязывать» стартовый `episode` с страницы.

### Пример

```js
const player = document.getElementById("myPlayer");

player.addEventListener("currentTime", (e) => {
  // throttle перед записью прогресса
  console.log(e.detail.time);
});

player.addEventListener("changeState", (e) => {
  console.log(e.detail.state); // playing | paused | stopped
});
```

Цепочка рекламы: `adRequest → adStart → adEnd → rollState("complete")`.

---

## 6. Методы

| Метод | Описание |
|-------|----------|
| `player.selectSeason(number)` | Переключить сезон (если есть) |
| `player.selectEpisode(number)` | Переключить серию (если есть) |

```js
const player = document.getElementById("myPlayer");
player.selectSeason(1);
player.selectEpisode(1);
```

Seek / play / pause / setVolume в этой версии партнёрской доки **не описаны**.

---

## Соответствие TA ↔ Partners

| Partners | Track Anime сейчас |
|----------|-------------------|
| Inline `<video-player>` | По умолчанию inline; `/cdn-iframe` — опциональный shell |
| `is-show-voice-only=false` | Нативный выбор сезонов/серий в виджете + полоска TA |
| `data-aggregator="mali"` | В коде/plapi часто `mal` — для виджета лучше `mali` |
| `data-publisher-id` | `10326` (`NEXT_PUBLIC_CVH_PUB` / default) |
| `currentTime` + `changeState` | Ещё не подключены к watch progress / «Продолжить» |
| `selectEpisode` / `selectSeason` | Частично через remount атрибутов `episode`/`season` |

Карта всего ЛК: [partners-portal.md](./partners-portal.md).  
Другие doc-страницы: [Модуль DLE](./dle-module.md) · [API контента](https://partners.cdnvideohub.com/docs/content-api) (= public Content API / [overview.md](./overview.md)).
