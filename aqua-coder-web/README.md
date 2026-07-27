# Aqua Coder Chibi — веб-пакет

Этот пакет предназначен для сайта, а не для Codex Pet V2. Каждая анимация хранится в отдельном WebP-атласе, а их параметры — в единственном `manifest.json`.

## Быстрый старт

1. Скопируйте папку `public/companion/aqua-coder-chibi` в `public/companion/aqua-coder-chibi` вашего сайта.
2. Скопируйте `src/AquaCoderCanvas.ts` в исходники проекта.
3. Создайте `canvas`, передайте его в `new AquaCoderCanvas(canvas)` и вызовите `await player.start()`.

Полная инструкция для агента и для подключения в проект: [`docs/AGENT_INTEGRATION.md`](docs/AGENT_INTEGRATION.md).

Исходный процесс создания нового персонажа или новых эмоций: [`docs/NEW_CHARACTER_PIPELINE.md`](docs/NEW_CHARACTER_PIPELINE.md).

## Состав

```text
public/companion/aqua-coder-chibi/
  manifest.json             # единственный запрос с метаданными
  sprites/*.webp            # отдельный атлас на действие
src/AquaCoderCanvas.ts      # Canvas-рендерер без зависимостей
tools/build-atlases.py      # собирает WebP-атласы из PNG-кадров
```

Текущие атласы: кадр **192×208**, полоса **1536×208** (8 ячеек). У анимаций с меньшим числом кадров хвост полосы пустой; в `manifest` поле `frames` — живые кадры, `columns` — 8 (ширина атласа).

## Скорость анимаций

У каждой записи в общем `manifest.json` есть две настройки: `baseFps` (естественная скорость кадров) и `playbackRate` (множитель). Итог: `baseFps × playbackRate`. Например, `baseFps: 6` и `playbackRate: 0.5` — это 3 FPS, то есть вдвое медленнее. Во время работы сайта скорость можно временно переопределить: `player.play("waiting", { playbackRate: 0.5 })`.

Между циклами `mode: "loop"` рендерер держит последний кадр случайную паузу от 0 до 5 секунд, затем начинает цикл снова.

## Режимы и завершение

У каждой анимации есть явный `mode`:

- `loop` — бесконечный цикл (`idle`, `work`, `lying`, `sleeping`);
- `once` — одиночное событие (`wave`, `jump`, `searching`, `reading`, `celebrate`). После последнего кадра рендерер вызывает `onAnimationComplete` и сам переключает персонажа на `returnTo` (обычно `idle`).

Новые состояния: `lying`, `sleeping`, `searching`, `reading`, `celebrate`, `calendar`, `history`, `favorites`.
