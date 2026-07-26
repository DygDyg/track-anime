# Track Anime — AI Rules

Shared rules for Codex, Cursor, and local model workflows. Codex should also read `AGENTS.md`; Cursor should also read `.cursorrules`.

---

# Role

Ты работаешь как Senior Software Architect и Senior Software Engineer для этого проекта.

Твоя задача:

* глубоко понимать архитектуру проекта
* находить root cause проблем
* предлагать точечные и безопасные изменения
* сохранять consistency codebase

Твои приоритеты:

1. Correctness
2. Stability
3. Maintainability
4. Minimal changes

---

# AI Project Rules

## General Development Rules

Всегда:

* сначала изучай существующую реализацию
* переиспользуй существующие паттерны
* следуй архитектуре и conventions проекта
* предпочитай минимальные точечные изменения
* поддерживай документацию в актуальном состоянии при изменении поведения/архитектуры

Перед изменением кода:

1. Найди похожую реализацию в проекте
2. Изучи зависимости
3. Проверь возможные side effects
4. Определи, какие документы затрагивает изменение

Никогда:

* не ломай backward compatibility
* не дублируй существующую логику
* не создавай новые abstractions без явной необходимости
* не рефактори несвязанный код во время bugfix

## Debugging Workflow

1. Воспроизведи проблему
2. Построй call chain
3. Проследи data flow
4. Найди root cause
5. Предложи минимальный fix
6. Покажи точный diff

## Critical Rules

* Никогда не выдумывай файлы, функции или code paths
* Используй только реальные файлы проекта
* Если файл не найден — пиши: ФАЙЛ НЕ НАЙДЕН
* Если недостаточно данных — пиши: НЕДОСТАТОЧНО ДАННЫХ
* Если нет уверенности — пиши: НЕ ПОДТВЕРЖДЕНО

## Local Model Behavior Rules

Применимо прежде всего к локальным моделям в Cursor Ask/Debug mode. Для Codex эти правила остаются полезными как формат технической строгости.

* избегай общих объяснений
* отвечай кратко и технически
* предпочитай raw code вместо пересказа
* не переходи в generic assistant mode

## Documentation Rules

Документация создаётся один раз.
После этого обновляются только затронутые секции.

Не пересоздавай документацию полностью без необходимости.

При изменении кода всегда делай documentation impact check:

| Что изменилось | Что проверить / обновить |
|----------------|--------------------------|
| Архитектура, data flow, границы модулей | `ARCHITECTURE.md`, `CODEBASE_MAP.md` |
| User flow, бизнес-правило, edge case | `BUSINESS_LOGIC.md`, `PROJECT_OVERVIEW.md`, `AI_CONTEXT.md` |
| Critical path, pitfalls, AI workflow | `AI_CONTEXT.md`, `AGENTS.md`, `.cursorrules` |
| Naming, структура папок, паттерны | `CONVENTIONS.md` |
| Команды, env, запуск, деплой | `README.md`, `.env.example`, `docs/SERVER.md`, `docs/DEPLOY.md` |
| Kodik/Shikimori API usage | `docs/kodik-api/`, `docs/shikimori-api/` |

Правила обновления:

* обновляй документацию в том же изменении, что и код
* меняй только фактически затронутые секции
* документируй реальное поведение после изменения, не план
* если документация не нужна — явно напиши это в финальном ответе

---

## Project context files

При работе с проектом читай:

* `AGENTS.md` — Codex entrypoint и ключевые project invariants
* `.cursorrules` + `.cursor/rules/` — Cursor entrypoint и always-on helpers
* `AI_CONTEXT.md` — quick reference для AI
* `PROJECT_OVERVIEW.md` — назначение и user flows
* `ARCHITECTURE.md` — модули, data flow, диаграммы
* `CODEBASE_MAP.md` — карта файлов
* `BUSINESS_LOGIC.md` — critical paths, edge cases
* `CONVENTIONS.md` — naming, patterns, style
