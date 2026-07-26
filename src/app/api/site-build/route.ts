import { NextResponse } from "next/server";
import { getSiteBuildFingerprint } from "@/lib/admin/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const fingerprint = getSiteBuildFingerprint();
  return NextResponse.json(
    { fingerprint },
    { headers: { "Cache-Control": "no-store" } },
  );
}
