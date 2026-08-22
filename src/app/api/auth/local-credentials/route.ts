import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hashPassword, normalizeLocalLogin, validateLocalCredential } from "@/lib/auth/local-credentials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const credential = await prisma.localCredential.findUnique({
    where: { userId: session.user.id },
    select: { login: true },
  });
  return NextResponse.json({ login: credential?.login ?? null });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
  const login = typeof body?.login === "string" ? normalizeLocalLogin(body.login) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const error = validateLocalCredential(login, password);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const passwordHash = await hashPassword(password);

  try {
    await prisma.localCredential.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, login, passwordHash },
      update: { login, passwordHash },
    });
    return NextResponse.json({ login });
  } catch (cause) {
    if (typeof cause === "object" && cause && "code" in cause && cause.code === "P2002") {
      return NextResponse.json({ error: "Этот логин уже занят." }, { status: 409 });
    }
    throw cause;
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.localCredential.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
