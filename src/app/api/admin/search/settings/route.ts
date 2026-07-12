import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  MAX_HEADER_SEARCH_DEBOUNCE_MS,
  MIN_HEADER_SEARCH_DEBOUNCE_MS,
} from "@/lib/search-shared";
import { getSearchSettingsDto, updateSearchSettings } from "@/lib/search-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getSearchSettingsDto();
  return NextResponse.json({
    settings,
    minHeaderSearchDebounceMs: MIN_HEADER_SEARCH_DEBOUNCE_MS,
    maxHeaderSearchDebounceMs: MAX_HEADER_SEARCH_DEBOUNCE_MS,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as { headerSearchDebounceMs?: unknown };

  if (input.headerSearchDebounceMs === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const headerSearchDebounceMs = Number(input.headerSearchDebounceMs);
  if (
    !Number.isInteger(headerSearchDebounceMs) ||
    headerSearchDebounceMs < MIN_HEADER_SEARCH_DEBOUNCE_MS ||
    headerSearchDebounceMs > MAX_HEADER_SEARCH_DEBOUNCE_MS
  ) {
    return NextResponse.json(
      {
        error: `headerSearchDebounceMs: от ${MIN_HEADER_SEARCH_DEBOUNCE_MS} до ${MAX_HEADER_SEARCH_DEBOUNCE_MS}`,
      },
      { status: 400 },
    );
  }

  const settings = await updateSearchSettings({ headerSearchDebounceMs });
  return NextResponse.json({ settings });
}
