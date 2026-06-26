import { prisma } from "@/lib/prisma";

export type AdminTodoStatus = "planned" | "in_progress" | "done";

export type AdminTodoDto = {
  id: string;
  title: string;
  description: string | null;
  importance: number;
  complexity: number;
  status: AdminTodoStatus;
  score: number;
  createdAt: string;
  updatedAt: string;
};

type SeedTodo = {
  title: string;
  description?: string;
  importance: number;
  complexity: number;
};

const STATUS_ORDER: Record<AdminTodoStatus, number> = {
  in_progress: 0,
  planned: 1,
  done: 2,
};

export const ADMIN_TODO_SEED: SeedTodo[] = [
  {
    title: "Подписка на тайтлы в озвучках + Telegram-бот с уведомлениями о релизах",
    description:
      "Выбор тайтла и студии озвучки, хранение подписок, фоновая проверка новых серий, отправка в Telegram.",
    importance: 92,
    complexity: 78,
  },
  {
    title: "Установка сайта как приложение (PWA)",
    description: "Web App Manifest, service worker, иконки, prompt «Добавить на главный экран».",
    importance: 88,
    complexity: 42,
  },
  {
    title: "Синхронизация видео через WebSocket для совместного просмотра",
    description: "Комнаты, play/pause/seek sync между пользователями, интеграция с плеером Kodik.",
    importance: 75,
    complexity: 95,
  },
  {
    title: "Физические кнопки перемотки ±90 секунд",
    description: "Горячие клавиши и UI-кнопки для пропуска OP/ED и быстрой перемотки в плеере.",
    importance: 58,
    complexity: 28,
  },
  {
    title: "Сохранение настроек кастомизации в аккаунте Shikimori",
    importance: 68,
    complexity: 58,
  },
  {
    title: "Приоритет озвучки для каждого тайтла",
    description: "Если у тайтла несколько озвучек — выбирать предпочитаемую на главной и в карточке.",
    importance: 62,
    complexity: 48,
  },
  {
    title: "Фильтр по жанрам и году на главной",
    importance: 56,
    complexity: 52,
  },
  {
    title: "Скрывать завершённые и онгоинги отдельными переключателями",
    importance: 52,
    complexity: 32,
  },
  {
    title: "Плотность сетки: список / плитка / только постеры",
    importance: 48,
    complexity: 38,
  },
  {
    title: "Показывать жанры и описание в карточках на главной",
    importance: 44,
    complexity: 36,
  },
  {
    title: "Язык названий: русский / оригинал / оба",
    importance: 42,
    complexity: 26,
  },
  {
    title: "Анимированный или статичный фон сайта",
    importance: 34,
    complexity: 30,
  },
  {
    title: "Размер текста интерфейса",
    importance: 38,
    complexity: 22,
  },
  {
    title: "Скругление карточек и кнопок",
    importance: 28,
    complexity: 18,
  },
];

export function todoScore(importance: number, complexity: number): number {
  return Math.round(importance * 2 - complexity * 0.6);
}

function clampMetric(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}

function parseStatus(value: string): AdminTodoStatus {
  if (value === "in_progress" || value === "done") return value;
  return "planned";
}

function toDto(row: {
  id: string;
  title: string;
  description: string | null;
  importance: number;
  complexity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): AdminTodoDto {
  const importance = clampMetric(row.importance);
  const complexity = clampMetric(row.complexity);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    importance,
    complexity,
    status: parseStatus(row.status),
    score: todoScore(importance, complexity),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sortTodos(items: AdminTodoDto[]): AdminTodoDto[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.complexity - b.complexity;
  });
}

export async function ensureAdminTodoSeed(): Promise<void> {
  for (const item of ADMIN_TODO_SEED) {
    const existing = await prisma.adminTodo.findFirst({
      where: { title: item.title },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.adminTodo.create({
      data: {
        title: item.title,
        description: item.description ?? null,
        importance: item.importance,
        complexity: item.complexity,
        status: "planned",
      },
    });
  }
}

export async function listAdminTodos(): Promise<AdminTodoDto[]> {
  await ensureAdminTodoSeed();

  const rows = await prisma.adminTodo.findMany();
  return sortTodos(rows.map(toDto));
}

export async function createAdminTodo(input: {
  title: string;
  description?: string | null;
  importance?: number;
  complexity?: number;
}): Promise<AdminTodoDto> {
  const title = input.title.trim();
  if (!title) throw new Error("title_required");

  const row = await prisma.adminTodo.create({
    data: {
      title,
      description: input.description?.trim() || null,
      importance: clampMetric(input.importance ?? 50),
      complexity: clampMetric(input.complexity ?? 50),
      status: "planned",
    },
  });

  return toDto(row);
}

export async function updateAdminTodo(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    importance?: number;
    complexity?: number;
    status?: AdminTodoStatus;
  },
): Promise<AdminTodoDto | null> {
  const existing = await prisma.adminTodo.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await prisma.adminTodo.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.importance !== undefined ? { importance: clampMetric(input.importance) } : {}),
      ...(input.complexity !== undefined ? { complexity: clampMetric(input.complexity) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return toDto(row);
}

export async function deleteAdminTodo(id: string): Promise<boolean> {
  const existing = await prisma.adminTodo.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await prisma.adminTodo.delete({ where: { id } });
  return true;
}
