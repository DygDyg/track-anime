import { NextRequest, NextResponse } from "next/server";
import { getQrLoginStatus } from "@/lib/auth/qr-login";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const requesterSecret = request.nextUrl.searchParams.get("secret") ?? "";
  const status = await getQrLoginStatus(code, requesterSecret);
  if (!status) return NextResponse.json({ error: "QR-запрос не найден." }, { status: 404 });
  return NextResponse.json({ status });
}
