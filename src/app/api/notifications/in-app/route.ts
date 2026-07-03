import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  isInAppNotificationsEnabled,
  listInAppNotifications,
} from "@/lib/notifications/in-app-feed";

export const dynamic = "force-dynamic";

function parseSinceParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const enabled = await isInAppNotificationsEnabled(session.user.id);
  if (!enabled) {
    return NextResponse.json({ enabled: false, items: [], latestAt: null });
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = parseSinceParam(sinceParam) ?? new Date(Date.now() - 60_000);

  const items = await listInAppNotifications(session.user.id, since);
  const latestAt =
    items.length > 0 ? items[items.length - 1]?.notifiedAt ?? null : since.toISOString();

  return NextResponse.json({
    enabled: true,
    items,
    latestAt,
  });
}
