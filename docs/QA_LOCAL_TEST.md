# Общий QA-тест с AI-ассистентом

Протокол «как тестировщик»: найти баги в Track Anime с Codex, Cursor или локальной моделью.

**Идея:** вы — руки (браузер + терминал), AI — анализ кода и ваших наблюдений.  
**Не делайте** один широкий запрос «протестируй всё» — разбивайте проверку на фазы.

См. также: [LOCAL_MODEL_CHECK.md](./LOCAL_MODEL_CHECK.md) (Codex/Cursor режимы, анти-галлюцинации).

---

## Как это работает

```
┌─────────────────┐     наблюдения      ┌──────────────────┐
│  Вы (браузер)   │ ──────────────────► │ Локальная модель │
│  + терминал     │                     │ AI analysis      │
└─────────────────┘                     └────────┬─────────┘
        ▲                                        │
        │              баг-отчёт + файлы         │
        └────────────────────────────────────────┘
```

1. **Фаза 0** — автоматика (`tsc`, `build`) — без AI.
2. **Фазы 1–10** — вы проходите сценарий в браузере, AI ищет баги в коде.
3. **Фаза 11** — сводка всех находок.

**Codex:** для QA укажите «анализ без правок»; для fix — отдельная задача на один подтверждённый баг.  
**Cursor:** Ask mode для QA; Agent mode только для исправления одного подтверждённого бага.

---

## Перед стартом

### Окружение

```powershell
cd E:\GitHub\ta_new
npm run docker:up          # если Postgres не запущен
npm run dev                # http://localhost:3000
```

Проверьте `.env`: `DATABASE_URL`, `KODIK_API_TOKEN`, `SHIKIMORI_*`, `AUTH_URL`.

Для непустой ленты (если пусто):

```powershell
npm run kodik:sync
```

### Фаза 0 — smoke (без AI)

```powershell
npx tsc --noEmit
npm run build
```

Если есть ошибки — передайте ассистенту вывод команд и релевантные файлы (промпт A из [LOCAL_MODEL_CHECK.md](./LOCAL_MODEL_CHECK.md)).

### Лист для записи (скопируйте в блокнот)

```markdown
# QA-сессия Track Anime — ДАТА

## Smoke
- [ ] tsc OK
- [ ] build OK

## Наблюдения по фазам
### Фаза 1 Auth: ...
### Фаза 2 Home: ...
...

## Подтверждённые баги
| ID | Фаза | Шаги | Ожидание | Факт | Файл:строка | Статус |
|----|------|------|----------|------|-------------|--------|
```

---

## Стартовый промпт (новый чат / анализ без правок)

Скопируйте в **каждый** QA-чат/запрос или один раз в начале сессии:

```
Ты QA-инженер Track Anime. Работаешь только с прикреплёнными файлами/указанными путями, реальным кодом и моими наблюдениями. Код не меняй.

Правила:
- Не выдумывай файлы, API routes, компоненты
- Каждый баг: шаги воспроизведения + ожидание + факт + цитата кода (файл:строка)
- Если кода не видел — НЕ ПОДТВЕРЖДЕНО
- Разделяй: «баг в UI», «баг в API», «баг в логике sync», «edge case из BUSINESS_LOGIC.md»
- Не предлагай рефакторинг — только находки

Формат ответа:
| # | Серьёзность | Тип | Шаги | Ожидание | Факт | Файл:строка | Примечание |
```

---

## Фазы тестирования

Каждая фаза = **отдельный чат/запрос** (или один чат, но по одной фазе за сообщение).

---

### Фаза 1 — Auth / сессия

**URL:** `/login`, после входа — любая защищённая страница (`/favorites`, `/history`, `/profile`)

**Вы проверяете в браузере:**

- [ ] Login → редирект на Shikimori → возврат на сайт, вы залогинены
- [ ] Обновить страницу — сессия сохранилась
- [ ] Logout (если есть) — защищённые страницы недоступны
- [ ] Открыть `/favorites` без логина — редирект или сообщение

**Промпт для модели:**

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md
@src/lib/auth/shikimori-oauth.ts
@src/app/api/auth/callback/shikimori/route.ts
@src/app/login/page.tsx

Фаза 1 QA — Auth.

Мои наблюдения:
<вставьте: что сработало / что нет, ошибки Console/Network>

Проверь код на баги: OAuth state, redirect URI, session cookie, refresh token,
потеря сессии, race при callback. Сверь с edge cases из BUSINESS_LOGIC.md.
```

---

### Фаза 2 — Главная / лента релизов

**URL:** `/`

**Вы проверяете:**

- [ ] Лента загружается (не пустая после sync)
- [ ] Скролл вниз — подгружаются новые карточки
- [ ] Клик по карточке → страница аниме
- [ ] Блок «Скоро выйдут» над «Новое в вашей истории» (если залогинены и count > 0)
- [ ] Блок «Новое в вашей истории» (если залогинены и есть история)
- [ ] Фильтр озвучек (если настроен в settings)

**Промпт:**

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md
@src/lib/releases.ts
@src/components/ReleaseFeed.tsx
@src/app/page.tsx
@src/app/api/releases/route.ts

Фаза 2 QA — Home feed.

Мои наблюдения:
<...>

Ищи: пустая лента, дубликаты, битая пагинация, history-new блок,
фильтр переводов, ошибки infinite scroll.
```

---

### Фаза 3 — Страница аниме + плеер

**URL:** `/anime/5114` (или любой id из ленты)

**Вы проверяете:**

- [ ] Метаданные (название, описание, постер)
- [ ] Список озвучек, переключение
- [ ] Плеер запускается
- [ ] Прогресс сохраняется (перемотать → обновить страницу → позиция)
- [ ] Тайтл без Kodik — страница без плеера, но с Shikimori-данными

**Промпт:**

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md
@src/lib/anime-page.ts
@src/app/anime/[shikimoriId]/page.tsx
@src/components/anime/KodikPlayer.tsx
@src/components/anime/AnimeWatchPanel.tsx
@src/lib/kodik-player-api.ts
@src/app/api/user/watch-history/route.ts

Фаза 3 QA — Anime page + player.

Мои наблюдения:
<...>

Ищи: postMessage, сохранение progress, смена озвучки, один progress на shikimoriId,
отсутствие KodikMaterial, race при load history.
```

---

### Фаза 4 — История просмотра

**URL:** `/history`

**Вы проверяете:**

- [ ] Список просмотренного отображается
- [ ] Постеры не битые
- [ ] Клик → страница аниме с нужной позицией
- [ ] Пустая история — корректное empty state

**Промпт:**

```
@AI_CONTEXT.md
@src/lib/history-watch-card.ts
@src/components/history/HistoryWatchCard.tsx
@src/app/history/page.tsx
@src/app/api/user/watch-history/route.ts

Фаза 4 QA — Watch history.

Мои наблюдения:
<...>
```

---

### Фаза 5 — Списки / избранное

**URL:** `/favorites`, `/user/[shikimoriId]/favorites`

**Вы проверяете:**

- [ ] Списки загружаются (смотрю, в планах, …)
- [ ] Смена статуса / оценки — сохраняется после refresh
- [ ] Rewatch (+1) — поведение по политике из AI_CONTEXT.md
- [ ] Сообщение «локальная копия» при offline/error sync
- [ ] Публичные списки другого пользователя

**Промпт:**

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md
@DECISIONS.md (если файл есть; если нет — используй политику rewatches из AI_CONTEXT.md)
@src/lib/favorites-sync.ts
@src/lib/shikimori/user-list-mutations.ts
@src/components/favorites/FavoritesView.tsx
@src/app/api/user/anime-lists/route.ts

Фаза 5 QA — Lists / favorites.

Мои наблюдения:
<...>

Особое внимание: rewatch policy, sync pull vs local, 401 refresh, перезапись rewatches.
```

---

### Фаза 6 — Поиск

**URL:** `/search`

**Вы проверяете:**

- [ ] Простой запрос по названию
- [ ] Расширенный поиск (год, жанры, рейтинг — если есть UI)
- [ ] Пустой результат
- [ ] Спецсимволы / длинный запрос
- [ ] Подсказки (suggest), если есть

**Промпт:**

```
@AI_CONTEXT.md
@src/lib/search.ts
@src/app/search/page.tsx
@src/app/api/search/route.ts

Фаза 6 QA — Search.

Мои наблюдения:
<...>

Ищи: SQL edge cases, пустой query, performance, некорректные фильтры.
```

---

### Фаза 7 — Профиль / календарь / прочее

**URL:** `/profile`, `/calendar`, `/user/[id]`, `/players`

**Вы проверяете:**

- [ ] Профиль своего аккаунта
- [ ] Публичный профиль по Shikimori ID
- [ ] Календарь — ongoing аниме, даты
- [ ] Страница плееров (если используется)

**Промпт:**

```
@PROJECT_OVERVIEW.md
@src/app/profile/page.tsx
@src/app/calendar/page.tsx
@src/app/user/[shikimoriId]/page.tsx

Фаза 7 QA — Profile / calendar / misc.

Мои наблюдения:
<...>
```

---

### Фаза 8 — Обложки / постеры

**Проверка:** главная, history, search — нет массово битых картинок

**Промпт:**

```
@AI_CONTEXT.md
@src/lib/poster.ts
@src/lib/poster-fallback.ts
@src/lib/cover-cache.ts
@src/app/api/cover/route.ts
@src/components/AnimePoster.tsx

Фаза 8 QA — Posters / covers.

Мои наблюдения (какие id без постера, 404 на /api/cover, ...):
<...>
```

---

### Фаза 9 — PWA / mobile / offline

**Вы проверяете:**

- [ ] Узкий viewport (DevTools → mobile)
- [ ] Нижняя навигация (PwaBottomNav)
- [ ] `/~offline` или offline-поведение
- [ ] Доступ с LAN IP (`http://192.168.x.x:3000`) — JS грузится

**Промпт:**

```
@AI_CONTEXT.md
@src/components/PwaBottomNav.tsx
@src/app/~offline/page.tsx

Фаза 9 QA — PWA / mobile.

Мои наблюдения:
<...>
```

---

### Фаза 10 — Админка (если вы admin)

**URL:** `/admin`, `/admin/import`, `/admin/data`

**Вы проверяете:**

- [ ] Не-admin не видит админку
- [ ] Import / sync UI
- [ ] DB explorer не ломает prod-данные случайно

**Промпт:**

```
@src/lib/auth/admin.ts
@src/app/admin/page.tsx
@src/lib/admin/kodik-sync.ts

Фаза 10 QA — Admin.

Мои наблюдения:
<...>
```

---

### Фаза 11 — Сводка (один финальный чат)

После всех фаз вставьте **только ваш лист наблюдений и таблицу багов** (без кода):

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md

Фаза 11 — итоговая сводка QA.

Ниже все мои наблюдения и баги по фазам 1–10:
<вставьте лист>

Задачи:
1. Убери дубликаты
2. Отсортируй по серьёзности (blocker / major / minor)
3. Для каждого бага укажи: нужен ли fix в коде или это env/data проблема
4. Предложи порядок исправления (1–2–3)
5. Пометь что НЕ ПОДТВЕРЖДЕНО без цитаты кода
```

---

## Статический QA (без браузера)

Если нет времени на ручной прогон — модель ищет баги **только в коде** по edge cases из `BUSINESS_LOGIC.md`:

```
@AI_CONTEXT.md
@BUSINESS_LOGIC.md
@DECISIONS.md (если файл есть; если нет — используй политику rewatches из AI_CONTEXT.md)

Статический QA: пройди edge cases из BUSINESS_LOGIC.md и AI_CONTEXT.md (Frequent Pitfalls).
Для каждого edge case найди в коде место обработки и оцени: OK / риск / баг.
Цитата файл:строка обязательна. Без цитаты — НЕ ПОДТВЕРЖДЕНО.

Edge cases для проверки:
- Нет Kodik данных для shikimoriId
- Несколько озвучек + фильтр в settings
- OAuth redirect mismatch
- Empty feed после deploy
- Expired Shikimori token (401)
- Rewatches policy
- Session lost / cookie
```

Делайте **по 2–3 edge case за сообщение**, прикрепляя соответствующие файлы из `AI_CONTEXT.md`.

---

## Шаблон баг-репорта

```markdown
### BUG-001 — краткое название

**Серьёзность:** blocker | major | minor  
**Фаза:** 3 (Anime + player)  
**Статус:** подтверждён | только в коде | env/data

**Шаги:**
1. ...
2. ...

**Ожидание:** ...  
**Факт:** ...

**Console / Network:**  
- ...

**Код (если нашла модель):** `src/.../File.ts:123`  
**Проверено вручную:** да / нет
```

---

## Оценка времени

| Что | Время |
|-----|-------|
| Фаза 0 (tsc + build) | ~2–5 мин |
| Одна фаза (браузер + промпт) | ~10–15 мин |
| Полный прогон 1–10 | ~2–3 часа |
| Статический QA (без браузера) | ~30–60 мин |
| Фаза 11 сводка | ~10 мин |

---

## Чего избегать

| Плохо | Хорошо |
|-------|--------|
| «Протестируй весь сайт как QA» одним Agent-запросом | 10 фаз, узкий анализ по одной |
| Доверять багам без `файл:строка` | Открыть файл и проверить |
| Один огромный `@` на весь `src/` | 3–6 файлов на фазу |
| Исправлять всё сразу | Один баг → один fix → `tsc` + retest |

---

## Связанные документы

| Файл | Зачем |
|------|-------|
| [LOCAL_MODEL_CHECK.md](./LOCAL_MODEL_CHECK.md) | Режимы Codex/Cursor, анти-галлюцинации |
| [AI_CONTEXT.md](../AI_CONTEXT.md) | Пути к файлам, pitfalls |
| [BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) | User flows, edge cases |
| [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) | Список фич |
