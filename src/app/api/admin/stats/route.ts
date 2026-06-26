import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAdminDashboardStats } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const stats = await getAdminDashboardStats();
  return NextResponse.json(stats);
}
