# Импорт базы Kodik

## Модель данных (как в Kodik)

```
KodikMaterial     — одно аниме + одна озвучка (serial-xxx)
  └── KodikSeason — сезон
        └── KodikEpisode — серия + ссылка на плеер

KodikEpisodeRelease — лента новых серий для главной
```

Один `shikimori_id` → **много** `KodikMaterial` (по одному на каждую озвучку).

## Полный импорт истории

Два этапа (скрипт делает автоматически):

| Фаза | Что делает | Скорость |
|------|------------|----------|
| **catalog** | `/list` постранично — все материалы | ~тысячи/час |
| **episodes** | `/search?id=serial-xxx&with_episodes_data=true` | медленнее, все серии |

### Запуск

```bash
cp .env.example .env
# заполнить DATABASE_URL и KODIK_API_TOKEN

npm install
npm run db:push
npm run kodik:import
```

### Продолжить после прерывания

Прогресс сохраняется в таблице `KodikImportJob` (catalog — URL следующей страницы, episodes — флаг `episodesLoaded` у материалов).

```bash
npm run kodik:import:resume
```

Команда показывает текущий прогресс и продолжает с нужной фазы. Повторный `npm run kodik:import` тоже не начинает catalog заново, если он уже завершён.

### Опции

```bash
npm run kodik:import -- --catalog-only    # только каталог
npm run kodik:import:resume               # продолжить после Ctrl+C
npm run kodik:import:episodes             # догрузить серии
npm run kodik:import -- --reset           # сбросить прогресс catalog
npm run kodik:import -- --no-material-data
```

Прогресс фазы catalog сохраняется в `KodikImportJob` — можно остановить и продолжить через `kodik:import:resume`.

## Инкрементальное обновление (10 мин)

```bash
npm run kodik:sync
```

Cron (Linux):

```cron
*/10 * * * * cd /path/to/ta_new && npm run kodik:sync >> logs/kodik-sync.log 2>&1
```

## Оценка объёма

- Материалов (аниме × озвучки): **десятки тысяч**
- Серий: **сотни тысяч — миллионы**
- Полный импорт: **часы — дни** (лимит Kodik: 5 rps / 90 rpm)

Рекомендуется PostgreSQL на SSD.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `DATABASE_URL` | PostgreSQL |
| `KODIK_API_TOKEN` | Токен Kodik |
| `KODIK_API_URL` | По умолчанию `https://kodik-api.com` |
| `KODIK_SYNC_PAGES` | Страниц за один sync (default: 3) |
