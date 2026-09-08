import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readToken(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (typeof body.token !== "string") return null;
  const token = body.token.trim();
  return token.length > 0 ? token : null;
}

export async function POST(request: Request) {
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

  const token = readToken(body);
  if (!token) {
    return NextResponse.json({ error: "Некорректный FCM-токен" }, { status: 400 });
  }

  // Token may move between users after re-login on the same device.
  const existing = await prisma.fcmDeviceToken.findUnique({
    where: { token },
    select: { id: true, userId: true },
  });

  if (existing && existing.userId !== session.user.id) {
    await prisma.fcmDeviceToken.delete({ where: { id: existing.id } });
  }

  await prisma.fcmDeviceToken.upsert({
    where: { token },
    create: {
      userId: session.user.id,
      token,
    },
    update: {
      userId: session.user.id,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let token: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    token = readToken(body);
  } catch {
    token = null;
  }

  if (token) {
    await prisma.fcmDeviceToken.deleteMany({
      where: { userId: session.user.id, token },
    });
  } else {
    await prisma.fcmDeviceToken.deleteMany({
      where: { userId: session.user.id },
    });
  }

  return NextResponse.json({ ok: true });
}
