import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getServerLoadSnapshot } from "@/lib/admin/server-load";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const snapshot = await getServerLoadSnapshot();
  return NextResponse.json(snapshot);
}
