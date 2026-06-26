import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { backfillReleaseDates } from "@/lib/admin/kodik-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const updated = await backfillReleaseDates();
    revalidateTag("releases", "max");

    return NextResponse.json({
      message: `Обновлено релизов: ${updated}.`,
      updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
