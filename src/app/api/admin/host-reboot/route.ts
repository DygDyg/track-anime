import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getHostRebootStatus, scheduleHostReboot } from "@/lib/admin/host-reboot";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const status = await getHostRebootStatus();
  return NextResponse.json(status);
}

export async function POST() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const result = await scheduleHostReboot();
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        blockers: result.blockers ?? [],
        status: await getHostRebootStatus(),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    message: result.message,
    delayMinutes: result.delayMinutes,
    status: await getHostRebootStatus(),
  });
}
