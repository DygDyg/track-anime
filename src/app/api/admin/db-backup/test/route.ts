import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { testDbBackupWebDav } from "@/lib/admin/db-backup";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const result = await testDbBackupWebDav();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
