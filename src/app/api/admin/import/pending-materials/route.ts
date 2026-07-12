import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getPendingKodikMaterials } from "@/lib/admin/pending-kodik-materials";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const cursor = url.searchParams.get("cursor");

  const data = await getPendingKodikMaterials({ limit, cursor });
  return NextResponse.json(data);
}
