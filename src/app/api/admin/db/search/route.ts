import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  DB_EXPLORER_MODELS,
  DB_MODEL_KEYS,
  isDbModelKey,
  searchDb,
  type DbSearchMode,
} from "@/lib/admin/db-explorer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const url = new URL(request.url);
  const model = url.searchParams.get("model") ?? "";

  if (!model) {
    return NextResponse.json({
      models: DB_MODEL_KEYS.map((key) => ({
        key,
        label: DB_EXPLORER_MODELS[key].label,
        columns: DB_EXPLORER_MODELS[key].columns,
        searchable: DB_EXPLORER_MODELS[key].searchable,
      })),
    });
  }

  if (!isDbModelKey(model)) {
    return NextResponse.json({ error: "Неизвестная таблица" }, { status: 400 });
  }

  const field = url.searchParams.get("field") ?? undefined;
  const value = url.searchParams.get("value") ?? undefined;
  const modeParam = url.searchParams.get("mode");
  const mode: DbSearchMode | undefined =
    modeParam === "exact" || modeParam === "contains" ? modeParam : undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "25");

  const result = await searchDb({ model, field, value, mode, page, limit });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
