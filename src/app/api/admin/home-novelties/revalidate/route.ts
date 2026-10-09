import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { HOME_NOVELTIES_CACHE_TAG } from "@/lib/home-novelties";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  revalidateTag(HOME_NOVELTIES_CACHE_TAG, "max");

  return NextResponse.json({
    message: "Кеш «Новинки» сброшен. Список пересоберётся при следующем открытии главной.",
  });
}
