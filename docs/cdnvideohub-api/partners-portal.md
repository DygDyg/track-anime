# CDN VideoHub — личный кабинет Partners

> Источник: [partners.cdnvideohub.com](https://partners.cdnvideohub.com/) (CVH Partners **v1.0.0**, просмотрено в ЛК).  
> Связано: [player-setup-partners.md](./player-setup-partners.md) · [dle-module.md](./dle-module.md) · [overview.md](./overview.md)

Карта разделов ЛК и что из них полезно для интеграции Track Anime.  
**Секреты** (Bearer Content API, ключи крона) в репозиторий не копировать — только где их взять.

---

## Документация в ЛК (ровно 3 страницы)

| Раздел меню | URL | Что внутри | Локальная копия |
|-------------|-----|------------|-----------------|
| Установка плеера | [/docs/player-setup](https://partners.cdnvideohub.com/docs/player-setup) | `<video-player>`, параметры, события, методы, **запрет iframe** | [player-setup-partners.md](./player-setup-partners.md) |
| Модуль для DLE | [/docs/dle-module](https://partners.cdnvideohub.com/docs/dle-module) | DataLife Engine: граббинг, тег плеера, крон | [dle-module.md](./dle-module.md) |
| API контента | [/docs/content-api](https://partners.cdnvideohub.com/docs/content-api) | Базовый URL + кнопка токена + iframe Swagger | [overview.md](./overview.md) + [`doc.json`](https://public-api.cdnvideohub.com/api/v1/docs/doc.json) |

Других публичных doc-страниц в сайдбаре ЛК **нет** (нет отдельной доки plapi / seek / postMessage).

### Страница «API контента»

Текст в ЛК:

> Запросы — на базовый адрес с заголовком `Authorization: Bearer <токен>`. Токен получите кнопкой «Показать токен», затем в справочнике нажмите Authorize и пробуйте запросы через Try it out.

| | |
|--|--|
| Базовый URL в UI | `https://public-api.cdnvideohub.com/api/v1` |
| Swagger | [index.html](https://public-api.cdnvideohub.com/api/v1/docs/index.html) (встроен iframe + «Открыть в новой вкладке») |
| Токен | кнопка **«Показать токен»** на этой странице / в **Настройки** |

Это тот же Content API, что уже описан в `docs/cdnvideohub-api/` — не отдельный контракт.

---

## Остальные разделы ЛК (не документация, но полезно)

| Раздел | URL | Смысл для TA |
|--------|-----|--------------|
| Дашборд | `/` | Статистика площадок |
| Сайты | `/sites` | Площадки и **publisher id (`pub`)** для `data-publisher-id` |
| Вывод средств | `/wallet` | Выплаты (операционка) |
| Контент → Тайтлы | `/content/titles` | UI-каталог; поиск по названию или ID: **KP, IMDb, MAL, MDL, `title-<uuid>`**; выгрузка Excel |
| Контент → Стол заказов | `/content/orders` | Заявки на **новый тайтл** / **новые эпизоды**; можно «Поддержать» чужие заявки. Типы направлений в UI: аниме / дорамы / западный контент и т.п. |
| Чат поддержки | `/support` | Тикеты |
| Настройки | `/settings` | Профиль; снова **«Показать токен»** Content API |

Стол заказов — операционный способ запросить отсутствующий тайтл/эпизод, если Content API / plapi пустые.

---

## Лендинг cdnvideohub.com (публичный FAQ)

| Тема | Формулировка |
|------|----------------|
| Каталог | аниме, дорамы, Турция, западный контент; **с РФ-контентом не работают** |
| Публичный API | да (Content API) |
| Модуль DLE | да, в ЛК |
| Выплаты | раз в месяц |
| Условия площадки | от ~2000 уников/сутки, доступ в метрику, **их плеер на первом месте** |
| Монетизация (маркетинг) | «белый» CPM ~40₽ (цифра с лендинга; не API) |
| Контакты | `@CVHsupportBot`, `partner@cdnvideohub.com` |

---

## Что важно для Track Anime

1. **Техдока для плеера** — только player-setup (+ наш разбор plapi).  
2. **Bearer** Content API берётся в ЛК («Показать токен»), не из OpenAPI.  
3. **`pub`** — из площадки в «Сайты» (у TA: `10326` / env).  
4. **DLE** для Next.js-сайта не нужен; полезен как подтверждение внешних ID: KP / IMDb / MAL / MDL и что плеер завязан на **ID партнёра**.  
5. Отдельной доки по **seek / Kodik-like Continue** в Partners **нет**.
