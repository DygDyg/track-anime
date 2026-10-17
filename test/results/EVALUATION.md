# Оценка теста Track Anime (свежий прогон 08.10 ~03:55)

Сравнение с эталоном `test/etalon/` + сверка с текущим кодом.  
Самооценка модели в исходном файле: **91/100** — ниже независимая оценка тем же рубрикатором, что у других прогонов.

## Итог: ~91/100

Отличный прогон уровня Hermes+Grok (~90) и выше устаревшего эталона по актуальности. Самооценка **подтверждается**.

| Критерий | Вес | Балл | Почему |
|----------|-----|------|--------|
| Корректность | 30% | **27/30** | Инварианты, цепочки, sync/ensure, channels с FCM — совпадают с кодом |
| Полнота | 20% | **20/20** | Все 1.1–10.5; уместные оговорки |
| Конкретность | 20% | **18/20** | Реальные файлы/строки (`releases` 605, `admin` 5–25, panel 198/3590) |
| Конвенции в коде | 15% | **13/15** | RU, `@/lib/prisma`, `UserAnimeBookmark`; 9.3 без `buildSearchHref` |
| Баги / рефакторинг | 15% | **13/15** | Верные риски; 5.2 чуть мягче эталона про лишний catalog round-trip |

---

## Сравнение прогонов

| Прогон | Оценка |
|--------|--------|
| Qwen stubs / Codex | ~16 |
| Qwen / Hermes | ~35 |
| `results_v1` | ~38 |
| Composer эталон (июль) vs код сейчас | ~84 |
| Hermes + Grok Composer | ~90 |
| **Этот прогон** | **~91** |

---

## Сильнее старого эталона

- **3.2:** `COMPLETED_SERIES_MAX_AGE_DAYS = 90` найдена (`releases.ts:165`)
- **1.7:** канал **FCM** + `fcm.ts`
- **3.3 / 10.1:** `ensureKodikMaterialsForShikimoriId` (on-demand Kodik search) — подтверждено `anime-page.ts` / `kodik-ensure-materials.ts`
- **3.10 / 10.3:** HTTP retry в `kodik/client.ts` (429/5xx) + отсутствие re-queue на уровне sync job
- **9.1:** поля только из реальной `UserAnimeBookmark` (без вымышленного `label`)
- **2.5:** реальные RU-строки (`HeaderAuth` «Войти», panel «Продолжить»)

## Мелкие минусы

| Место | Замечание |
|-------|-----------|
| 5.2 | Верно про phase handoff; эталон жёстче акцентировал «лишний запрос при пустом catalog» |
| 9.3 | Href руками `/search?genre=` вместо `buildSearchHref` из `search-shared` |
| 4.6 | Узко только `KodikPlayer` hooks; логика next-episode в `AnimeWatchPanel` (но 3.4 это закрывает) |
| Часть `~` строк | Окрестность верна; не каждый handler перечитан построчно |

## По разделам (кратко)

| # | Балл | Вердикт |
|---|------|---------|
| 1 | ~9.5/10 | Стек, schema, sync, cache, cover 404, WP handoff |
| 2 | ~8/8 | Ключ, proxy≠auth, progress unique, SyncRun/ImportJob |
| 3 | ~9.5/10 | Feed, 90d, skip/intro, QR split, OAuth route.ts |
| 4 | ~9.5/10 | Сигнатуры, cover, types, progress chain, next.config |
| 5 | ~4.5/5 | SQLi низкий риск; placeholder; no IP RL; race |
| 6 | ~5/5 | GENRES_JSON dup, AnimeWatchPanel, silent catch, dead exports |
| 7 | ~5/5 | CONVENTIONS naming/auth/docs impact |
| 8 | ~5/5 | Impact table + AI_CONTEXT/SERVER |
| 9 | ~4/5 | Рабочий код; GenreBadge чуть мимо shared helper |
| 10 | ~5/5 | ensure materials, LWW, 401/silent save, master handoff |

## Вердикт

**~91/100 — отлично.** Можно опираться на ответы как на карту репо с обычной code review. Самооценка модели (91) адекватна, не завышена.

Docs: только этот файл в `test/results/EVALUATION.md`.
