import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAdminUsers } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const users = await getAdminUsers(100);
  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: { userId?: string; isAdmin?: boolean };
  try {
    body = (await request.json()) as { userId?: string; isAdmin?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { userId, isAdmin } = body;
  if (!userId || typeof isAdmin !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (auth.user.id === userId && !isAdmin) {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
    select: { id: true, isAdmin: true },
  });

  return NextResponse.json({ user: updated });
}
