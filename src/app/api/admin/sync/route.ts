import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { runKodikIncrementalSync } from "@/lib/admin/kodik-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const result = await runKodikIncrementalSync({ trigger: "manual" });
    revalidateTag("releases", "max");

    return NextResponse.json({
      message: `Sync завершён: проверено ${result.checkedMaterials}, обновлено ${result.updatedMaterials}, новых релизов ${result.newReleases}.`,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
