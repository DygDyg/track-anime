import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession, type AuthUser } from "@/lib/auth/session";

export async function requireAdmin(): Promise<{ user: AuthUser }> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }
  return session;
}

export async function requireAdminApi(): Promise<{ user: AuthUser } | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

export function isAdminApiError(
  result: { user: AuthUser } | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
