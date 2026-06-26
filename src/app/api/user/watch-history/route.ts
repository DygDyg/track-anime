import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getWatchHistory } from "@/lib/watch-history";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const items = await getWatchHistory(session.user.id);
  return NextResponse.json({ items });
}
