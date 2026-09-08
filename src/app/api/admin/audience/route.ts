import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAudienceStats } from "@/lib/admin/audience-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const stats = await getAudienceStats();
  return NextResponse.json(stats);
}
