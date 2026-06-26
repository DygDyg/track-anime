import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserSiteSettings, saveUserSiteSettings } from "@/lib/user-site-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const settings = await getUserSiteSettings(session.user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const settings = await saveUserSiteSettings(session.user.id, body);
  return NextResponse.json({ settings });
}
