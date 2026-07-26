import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { approveQrLogin, rejectQrLogin } from "@/lib/auth/qr-login";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { code?: unknown; decision?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const decision = body?.decision === "approve" ? "approve" : body?.decision === "reject" ? "reject" : null;
  if (!code || !decision) return NextResponse.json({ error: "Некорректный QR-запрос." }, { status: 400 });
  const status = decision === "approve"
    ? await approveQrLogin(code, session.user.id)
    : await rejectQrLogin(code, session.user.id);
  if (!status) return NextResponse.json({ error: "QR-запрос не найден или истёк." }, { status: 404 });
  return NextResponse.json({ status });
}
