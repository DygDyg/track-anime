import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getImportJobStatus } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const job = await getImportJobStatus();
  return NextResponse.json({ job });
}
