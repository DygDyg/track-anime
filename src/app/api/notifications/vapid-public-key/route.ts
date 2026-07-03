import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushRuntimeConfigured } from "@/lib/notifications/channels/browser";

export const dynamic = "force-dynamic";

export async function GET() {
  const [publicKey, configured] = await Promise.all([
    getVapidPublicKey(),
    isWebPushRuntimeConfigured(),
  ]);

  if (!configured || !publicKey) {
    return NextResponse.json({ configured: false, publicKey: null });
  }

  return NextResponse.json({ configured: true, publicKey });
}
