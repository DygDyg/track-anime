import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getGitDeployStatus, startGitDeploy } from "@/lib/admin/git-deploy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const status = await getGitDeployStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let force = true;
  try {
    const body = (await request.json()) as { force?: boolean };
    if (typeof body.force === "boolean") force = body.force;
  } catch {
    // empty body → force rebuild by default from admin
  }

  const result = await startGitDeploy({ trigger: "admin", force });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const status = await getGitDeployStatus();
  return NextResponse.json({
    ok: true,
    message: result.message,
    alreadyRunning: result.alreadyRunning ?? false,
    status,
  });
}
