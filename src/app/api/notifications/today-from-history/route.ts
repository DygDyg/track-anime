import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { countTodayOngoingFromHistory } from "@/lib/notifications/today-from-history";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const count = await countTodayOngoingFromHistory(session.user.id);
  return NextResponse.json({ count });
}
