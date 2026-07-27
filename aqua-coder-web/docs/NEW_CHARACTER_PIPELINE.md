# Новый персонаж или эмоция: исходники и процесс

## Принцип

Не генерируйте сразу атлас. Сначала закрепите внешность персонажа, потом генерируйте отдельные PNG-кадры с прозрачным фоном и только после проверки собирайте WebP-атласы. Атлас — производный файл; исходники кадров и описание персонажа хранятся отдельно.

## Рекомендуемая структура

```text
characters/<character-id>/
  canon/
    character-spec.md       # неизменяемое описание внешности
    master-front.png        # HD-эталон, 2048–4096 px
    palette.md
  frames/
    idle/00.png ...
    wave/00.png ...
    work/00.png ...
  web/
    manifest.json
    sprites/
  prompts/
    base.md
    idle.md
    wave.md
```

Для нового веб-персонажа используйте кадры не меньше 768×832 px (соотношение 192×208). Это даст настоящую детализацию; увеличение нынешних 192×208 кадра не создаёт HD-качество.

## Шаг 1. Канон персонажа

В `canon/character-spec.md` зафиксировать лицо, форму и цвет глаз, причёску, одежду, пропорции, палитру, аксессуары и стиль рендера. Добавить правило: **эталонный master-арт всегда важнее текста; не редизайнивать персонажа между кадрами**.

Сгенерировать и утвердить один нейтральный HD-полный рост на прозрачном фоне. Не переходить к эмоциям, пока этот кадр не утверждён.

## Шаг 2. Кадры, а не готовый лист

Для каждого действия сгенерировать отдельные кадры `00.png`, `01.png` и т. д. Все кадры одного действия обязаны иметь одинаковый canvas, одинаковую базовую линию ног и одинаковый масштаб персонажа. Оставить прозрачное поле вокруг силуэта.

| Действие | Кадров | Режим |
| --- | ---: | --- |
| `idle` | 6–8 | loop |
| `wave` | 4–6 | один раз, возврат в idle |
| `work` | 6–10 | loop |
| `waiting` | 6–8 | loop |
| `error` | 6–8 | loop |
| `success` | 5–8 | один раз, возврат в idle |
| `lying` | 4–8 | loop |
| `sleeping` | 4–8 | loop, 1–3 FPS |
| `searching` | 5–8 | один раз, возврат в idle |
| `reading` | 4–8 | один раз или loop |

Эмоции, которые не движутся, всё равно удобно экспортировать как анимацию из одного кадра (`frames: 1`, `baseFps: 1`, `playbackRate: 1`).

Для каждой новой анимации обязательно задавать `baseFps` и `playbackRate` в общем `manifest.json`. Формула: `фактический FPS = baseFps × playbackRate`. Обычно `playbackRate` оставляют `1`; для более спокойной анимации ставят `0.5` или `0.75`, не меняя её исходную базовую скорость.

Также обязательно задать семантику: `mode: "loop"` для бесконечного состояния или `mode: "once"` для события. У `once` ставить `loop: false` и `returnTo: "idle"`; рендерер отправит `onAnimationComplete` и затем автоматически вернёт персонажа в idle.

## Шаг 3. Шаблон промпта для генерации одного кадра

```text
Use the attached canonical master art as the only visual reference.
Draw the exact same character: identical face, hairstyle, proportions, clothing,
colors and accessories. Do not redesign or reinterpret.

Output ONE full-body frame, transparent background, canvas 768x832.
Pose: <exact pose and emotion>.
Animation: frame <N> of <TOTAL>; keep the same scale, camera, baseline and silhouette
as the attached approved frames. No text, logo, scenery, shadows, effects or props
unless explicitly listed in the canonical specification.
```

Для ряда кадров прикладывать эталонный master-арт и соседний утверждённый кадр. После генерации проверить лицо, волосы, одежду, масштаб, край canvas и прозрачность. Бракованный кадр перегенерировать до сборки атласа.

## Шаг 4. Сборка веб-атласов

1. Скопировать `aqua-coder-web/public/companion/aqua-coder-chibi/manifest.json` как шаблон и поменять `id`, список анимаций и пути.
2. Положить PNG-кадры в `frames/<animation>/00.png...`.
3. Выполнить:

```bash
python3 aqua-coder-web/tools/build-atlases.py \
  --source characters/<character-id>/frames \
  --output characters/<character-id>/web \
  --manifest characters/<character-id>/web/manifest.template.json
```

4. Скопировать `web/` в `public/companion/<character-id>/` сайта и поменять `manifestUrl` в компоненте.

`--scale` допустим только как временный экспорт для интерфейса; он не заменяет HD-исходники.

## Шаг 5. Проверка

- все PNG в одном действии одинакового размера;
- кадры не обрезаны и не касаются границы;
- WebP сохраняет альфа-канал;
- `frames` в манифесте совпадает с реальным числом PNG;
- у каждой анимации есть положительные `baseFps` и `playbackRate`;
- `frameWidth × columns` совпадает с шириной атласа;
- анимация не меняет масштаб или базовую линию без причины;
- открытие сайта сначала загружает только `idle`.
