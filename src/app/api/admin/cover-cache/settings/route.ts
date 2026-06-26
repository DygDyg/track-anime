import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  COVER_BROWSER_CACHE_OPTIONS,
  COVER_MAX_AGE_OPTIONS,
  getCoverCacheAdminStats,
  getCoverCacheSettingsDto,
  updateCoverCacheSettings,
} from "@/lib/admin/cover-cache-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const [settings, stats] = await Promise.all([
    getCoverCacheSettingsDto(),
    getCoverCacheAdminStats(),
  ]);

  return NextResponse.json({
    settings,
    stats,
    maxAgeOptions: COVER_MAX_AGE_OPTIONS,
    browserCacheOptions: COVER_BROWSER_CACHE_OPTIONS,
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

  const input = body as {
    enabled?: unknown;
    maxAgeDays?: unknown;
    quality?: unknown;
    maxHeight?: unknown;
    browserCacheDays?: unknown;
  };

  const patch: {
    enabled?: boolean;
    maxAgeDays?: number;
    quality?: number;
    maxHeight?: number;
    browserCacheDays?: number;
  } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.maxAgeDays !== undefined) {
    const maxAgeDays = Number(input.maxAgeDays);
    if (
      !Number.isInteger(maxAgeDays) ||
      !(COVER_MAX_AGE_OPTIONS as readonly number[]).includes(maxAgeDays)
    ) {
      return NextResponse.json(
        { error: `maxAgeDays: одно из ${COVER_MAX_AGE_OPTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    patch.maxAgeDays = maxAgeDays;
  }

  if (input.quality !== undefined) {
    const quality = Number(input.quality);
    if (!Number.isInteger(quality) || quality < 40 || quality > 95) {
      return NextResponse.json({ error: "quality: от 40 до 95" }, { status: 400 });
    }
    patch.quality = quality;
  }

  if (input.maxHeight !== undefined) {
    const maxHeight = Number(input.maxHeight);
    if (!Number.isInteger(maxHeight) || maxHeight < 200 || maxHeight > 1200) {
      return NextResponse.json({ error: "maxHeight: от 200 до 1200" }, { status: 400 });
    }
    patch.maxHeight = maxHeight;
  }

  if (input.browserCacheDays !== undefined) {
    const browserCacheDays = Number(input.browserCacheDays);
    if (
      !Number.isInteger(browserCacheDays) ||
      !(COVER_BROWSER_CACHE_OPTIONS as readonly number[]).includes(browserCacheDays)
    ) {
      return NextResponse.json(
        { error: `browserCacheDays: одно из ${COVER_BROWSER_CACHE_OPTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    patch.browserCacheDays = browserCacheDays;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const settings = await updateCoverCacheSettings(patch);
  const stats = await getCoverCacheAdminStats();
  return NextResponse.json({ settings, stats });
}
