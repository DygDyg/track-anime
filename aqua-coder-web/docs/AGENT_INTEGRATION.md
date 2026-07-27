# Инструкция агенту: подключение Aqua Coder Chibi в сайт

## Цель

Подключить персонажа как управляемую Canvas-анимацию без загрузки всех ассетов сразу. В проекте должен быть один общий запрос к манифесту и только текущий/запрошенный WebP-атлас.

## Что добавить

Скопировать в проект без изменений:

```text
aqua-coder-web/public/companion/aqua-coder-chibi/
  manifest.json
  sprites/*.webp
aqua-coder-web/src/AquaCoderCanvas.ts
```

Для Next.js первый каталог должен оказаться в `public/companion/aqua-coder-chibi/`. Класс можно положить, например, в `src/lib/companion/AquaCoderCanvas.ts`.

Не подключать `spritesheet.webp` от Codex Pet V2: он предназначен только для Pets и не является веб-форматом.

## Контракт манифеста

`manifest.json` является единственным источником метаданных. Не создавать отдельные JSON для каждой анимации.

Каждая запись в `animations` должна иметь `image`, `frameWidth`, `frameHeight`, `frames`, `columns`, `baseFps`, `playbackRate`, `loop` и `mode`. `mode` — явное назначение анимации: `loop` или `once`; поле `loop` сохраняется для совместимости и всегда должно ему соответствовать. У `mode: "once"` обязательно есть `returnTo`.

Скорость считается так: `фактический FPS = baseFps × playbackRate`.

- `baseFps` — естественная скорость покадровой анимации;
- `playbackRate: 1` — играть с естественной скоростью;
- `playbackRate: 0.5` — играть вдвое медленнее;
- `playbackRate: 2` — играть вдвое быстрее.

Например, чтобы сделать ожидание более спокойным, в единственном `manifest.json` достаточно поставить:

```json
"waiting": {
  "baseFps": 6,
  "playbackRate": 0.5
}
```

Рендерер также позволяет временно изменить скорость без правки манифеста:

```ts
await player.play("work", { playbackRate: 0.75 });
player.setPlaybackRate(0.5);
```

При следующем `play("work")` без параметров снова будет применён `playbackRate` из манифеста.

Новая анимация = добавить одну WebP-картинку и одну запись в `manifest.json`. Старые атласы не пересобирать.

## Пример для React / Next.js

Компонент должен быть клиентским. Создать экземпляр ровно один раз, очищать при размонтировании, а команды от приложения передавать через `player.play()`.

```tsx
"use client";

import { useEffect, useRef } from "react";
import { AquaCoderCanvas } from "@/lib/companion/AquaCoderCanvas";

export function Companion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const player = new AquaCoderCanvas(canvasRef.current, { scale: 2 });
    void player.start();
    return () => player.destroy();
  }, []);

  return <canvas ref={canvasRef} aria-label="Aqua Coder" />;
}
```

Для команд используйте имена: `idle`, `work`, `runRight`, `runLeft`, `wave`, `jump`, `error`, `waiting`, `review`.

Дополнительные состояния: `lying`, `sleeping`, `searching`, `reading`, `celebrate`, `calendar`, `history`, `favorites`.

## Карта состояний сайта

| Событие | Анимация |
| --- | --- |
| Обычное состояние | `idle` |
| ИИ генерирует ответ/работает | `work` |
| Пользователь открыл чат | `wave` |
| Нужен ответ или подтверждение | `waiting` |
| Выполнено успешно | `jump`, затем `idle` |
| Ошибка запроса | `error` |
| Проверка результата | `review` |
| Отдых лёжа | `lying` |
| Долгое ожидание / ночной режим | `sleeping` |
| ИИ ищет информацию | `searching`, затем `idle` |
| ИИ изучает документ | `reading`, затем `idle` |
| Задача завершена успешно | `celebrate`, затем `idle` |
| Календарь / отметка даты | `calendar` |
| История просмотров | `history` |
| Избранное / добавление в список | `favorites` |
| Старт companion | `appear`, затем ситуация вкладки |
| Переход между страницами | `jumpRopeLoading` |
| Страница аниме | `sitting` |
| Плеер играет / на паузе | `sittingPlay` / `sittingPause` |

Не вызывать `play()` на каждом рендере React. Вызывать только при реальном изменении состояния.

## Одноразовые события

`mode: "once"` не нужно вручную возвращать в idle: после последнего кадра класс переключится на `returnTo`. Для аналитики, звука или следующей команды можно получить событие завершения:

```ts
const player = new AquaCoderCanvas(canvas, {
  onAnimationComplete: ({ animation, returnTo }) => {
    console.log(`${animation} завершена; переход к ${returnTo}`);
  },
});
```

## Производительность и обновления

- Рендерер останавливает отрисовку, если вкладка скрыта или canvas вне viewport.
- Браузер и класс кэшируют каждый уже загруженный атлас.
- На первом экране загружаются только `manifest.json` и `idle.webp`.
- Для новой версии меняйте путь папки, например `/companion/aqua-coder-chibi/v2/`, или имя WebP с хешем. Это исключит старый файл из CDN-кэша.
- Не заменяйте файл по тому же URL, пока включён долгий CDN-кэш.

## Проверка перед merge

1. Открыть страницу с пустым cache storage.
2. В Network убедиться: сначала только `manifest.json` и `idle.webp`.
3. Вызвать `play("wave")` и убедиться, что пришёл только `wave.webp`.
4. Проверить событие завершения и возврат `wave`, `jump`, `searching`, `reading`, `celebrate` к `idle`.
5. Прокрутить canvas за экран: отрисовка должна быть приостановлена.
6. Проверить `await player.play("waiting", { playbackRate: 0.5 })`: движение должно стать вдвое медленнее.
