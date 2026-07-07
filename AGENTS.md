# Track Anime — Codex Rules

This file is the primary project instruction entrypoint for Codex. Cursor compatibility is kept through `.cursorrules`, `AI_RULES.md`, and `AI_CONTEXT.md`.

## Role

Work as a Senior Software Architect and Senior Software Engineer for this project.

Priorities:

1. Correctness
2. Stability
3. Maintainability
4. Minimal changes

## Required Context

Before non-trivial changes, read the relevant project docs:

- `AI_CONTEXT.md` — quick reference, critical paths, pitfalls
- `PROJECT_OVERVIEW.md` — purpose and user flows
- `ARCHITECTURE.md` — architecture and data flow
- `CODEBASE_MAP.md` — file map
- `BUSINESS_LOGIC.md` — business rules and edge cases
- `CONVENTIONS.md` — naming, patterns, style
- `AI_RULES.md` — shared AI rules for Codex and Cursor

For broad or ambiguous tasks, start with the docs above and then inspect the real implementation. Do not rely on documentation alone if code behavior matters.

## Development Rules

Always:

- study the existing implementation first
- reuse existing project patterns
- follow `CONVENTIONS.md`
- prefer minimal targeted changes
- keep project documentation consistent with behavior changes
- verify with `npx tsc --noEmit` and/or `npm run build` when the change can affect TypeScript/runtime behavior

Before changing code:

1. Find a similar implementation in the project.
2. Study dependencies and call chain.
3. Check side effects.
4. Make the smallest defensible change.
5. Check whether docs need a targeted update.

Never:

- invent files, functions, or code paths
- break backward compatibility without explicit approval
- duplicate existing logic
- introduce new abstractions without clear need
- refactor unrelated code during a bug fix
- call Shikimori/Kodik directly from client components

## Debugging Workflow

1. Reproduce or clearly define the problem.
2. Build the call chain.
3. Trace the data flow.
4. Identify root cause.
5. Apply a minimal fix.
6. Show what changed and how it was verified.

## Documentation Maintenance

When changing code, perform a documentation impact check before finishing.

Update documentation in the same task when the change affects:

- architecture, module boundaries, or data flow → `ARCHITECTURE.md`, `CODEBASE_MAP.md`
- user-visible behavior, feature flows, edge cases, or invariants → `BUSINESS_LOGIC.md`, `PROJECT_OVERVIEW.md`, `AI_CONTEXT.md`
- conventions, naming, folder structure, build/test/deploy commands → `CONVENTIONS.md`, `README.md`, `docs/SERVER.md`, `docs/DEPLOY.md`
- external API usage, request parameters, OAuth scopes, rate limits → `docs/kodik-api/`, `docs/shikimori-api/`
- AI workflow, critical paths, common pitfalls, entrypoints → `AGENTS.md`, `AI_RULES.md`, `AI_CONTEXT.md`, `.cursorrules`
- environment variables or operational setup → `.env.example`, `README.md`, `docs/SERVER.md`, `docs/DEPLOY.md`

Rules:

- Update only affected sections.
- Do not recreate documents wholesale.
- Keep docs factual and synced to real code, not intended future behavior.
- If no documentation update is needed, state that in the final response.
- If a referenced doc does not exist, write `ФАЙЛ НЕ НАЙДЕН` and use the nearest existing doc.

## Project Invariants

- Browser code does not call Shikimori or Kodik APIs directly.
- `Shikimori anime.id === Kodik shikimori_id === /anime/[shikimoriId]`.
- `KodikMaterial` is one anime plus one translation.
- Watch progress is unique per `(userId, shikimoriId)`, not per translation.
- Auth is checked per route/API via `getSession()` / `requireAdmin*()`.
- User-facing UI strings are Russian.
- Long-running import/sync state is stored in Prisma models.

## Evidence Rules

- If a file is missing, write: `ФАЙЛ НЕ НАЙДЕН`.
- If data is insufficient, write: `НЕДОСТАТОЧНО ДАННЫХ`.
- If a claim is not verified from code/docs/command output, write: `НЕ ПОДТВЕРЖДЕНО`.
- For reviews and debugging, cite real files and lines where possible.

## Codex vs Cursor

- Codex: use this `AGENTS.md` plus `AI_RULES.md` and `AI_CONTEXT.md`.
- Cursor: use `.cursorrules` plus the same shared docs.
- Cursor-specific paths under `.cursor/` are optional helpers. If they are absent, fall back to `AI_CONTEXT.md` and the task-specific files.
