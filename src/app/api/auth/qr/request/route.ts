import { NextResponse } from "next/server";
import { createQrLoginRequest } from "@/lib/auth/qr-login";

export const runtime = "nodejs";

export async function POST() {
  const request = await createQrLoginRequest();
  return NextResponse.json(request);
}
