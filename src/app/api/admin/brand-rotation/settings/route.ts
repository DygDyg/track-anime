import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  MAX_BRAND_ROTATION_INTERVAL_MINUTES,
  MIN_BRAND_ROTATION_INTERVAL_MINUTES,
  getBrandRotationSettingsDto,
  forceBrandLogoRotation,
  updateBrandRotationSettings,
} from "@/lib/admin/brand-rotation-settings";
import {
  BRAND_LOGOS_DIR,
  getActiveBrandAsset,
  invalidateBrandLogoFilesCache,
  listBrandLogoFiles,
} from "@/lib/brand-rotation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  invalidateBrandLogoFilesCache();
  const [settings, files, brand] = await Promise.all([
    getBrandRotationSettingsDto(),
    listBrandLogoFiles(),
    getActiveBrandAsset(),
  ]);

  return NextResponse.json({
    settings,
    minIntervalMinutes: MIN_BRAND_ROTATION_INTERVAL_MINUTES,
    maxIntervalMinutes: MAX_BRAND_ROTATION_INTERVAL_MINUTES,
    logoCount: files.length,
    logosDir: BRAND_LOGOS_DIR,
    activeLogoSrc: brand.logoSrc,
    activeLogoFileName: brand.file?.fileName ?? null,
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

  const input = body as { enabled?: unknown; intervalMinutes?: unknown };
  if (input.enabled === undefined && input.intervalMinutes === undefined) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const patch: { enabled?: boolean; intervalMinutes?: number } = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.intervalMinutes !== undefined) {
    const intervalMinutes = Number(input.intervalMinutes);
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < MIN_BRAND_ROTATION_INTERVAL_MINUTES ||
      intervalMinutes > MAX_BRAND_ROTATION_INTERVAL_MINUTES
    ) {
      return NextResponse.json(
        {
          error: `intervalMinutes: от ${MIN_BRAND_ROTATION_INTERVAL_MINUTES} до ${MAX_BRAND_ROTATION_INTERVAL_MINUTES}`,
        },
        { status: 400 },
      );
    }
    patch.intervalMinutes = intervalMinutes;
  }

  const settings = await updateBrandRotationSettings(patch);
  const brand = await getActiveBrandAsset();
  const files = await listBrandLogoFiles();

  return NextResponse.json({
    settings,
    logoCount: files.length,
    activeLogoSrc: brand.logoSrc,
    activeLogoFileName: brand.file?.fileName ?? null,
  });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  invalidateBrandLogoFilesCache();
  const settings = await forceBrandLogoRotation();
  const brand = await getActiveBrandAsset();
  const files = await listBrandLogoFiles();

  return NextResponse.json({
    settings,
    logoCount: files.length,
    activeLogoSrc: brand.logoSrc,
    activeLogoFileName: brand.file?.fileName ?? null,
  });
}
