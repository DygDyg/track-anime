import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { createAdminTodo, listAdminTodos } from "@/lib/admin/todos";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const items = await listAdminTodos();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = typeof (body as { title?: unknown }).title === "string" ? (body as { title: string }).title : "";
  const description =
    typeof (body as { description?: unknown }).description === "string"
      ? (body as { description: string }).description
      : null;
  const importance =
    typeof (body as { importance?: unknown }).importance === "number"
      ? (body as { importance: number }).importance
      : undefined;
  const complexity =
    typeof (body as { complexity?: unknown }).complexity === "number"
      ? (body as { complexity: number }).complexity
      : undefined;

  if (!title.trim()) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  try {
    const item = await createAdminTodo({ title, description, importance, complexity });
    return NextResponse.json({ item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
