import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { deleteAdminTodo, updateAdminTodo, type AdminTodoStatus } from "@/lib/admin/todos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseStatus(value: unknown): AdminTodoStatus | undefined {
  if (value === "planned" || value === "in_progress" || value === "done") return value;
  return undefined;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = body as {
    title?: unknown;
    description?: unknown;
    importance?: unknown;
    complexity?: unknown;
    status?: unknown;
  };

  const item = await updateAdminTodo(id, {
    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
    ...(typeof payload.description === "string" || payload.description === null
      ? { description: payload.description as string | null }
      : {}),
    ...(typeof payload.importance === "number" ? { importance: payload.importance } : {}),
    ...(typeof payload.complexity === "number" ? { complexity: payload.complexity } : {}),
    ...(parseStatus(payload.status) ? { status: parseStatus(payload.status) } : {}),
  });

  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const { id } = await context.params;
  const deleted = await deleteAdminTodo(id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
