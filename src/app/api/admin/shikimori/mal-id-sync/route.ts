import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getMalIdSyncStatus, refreshMalIdMappings } from "@/lib/admin/mal-id-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return Math.min(value, 10_000);
}

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const status = await getMalIdSyncStatus();
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: unknown;
      force?: unknown;
    };
    const result = await refreshMalIdMappings({
      limit: parseLimit(body.limit),
      force: body.force === true,
    });

    return NextResponse.json({
      message: `MAL ID: проверено ${result.fetched}, найдено ${result.withMalId}, без MAL ID ${result.withoutMalId}.`,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MAL ID sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
