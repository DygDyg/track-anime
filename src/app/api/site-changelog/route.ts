import { NextResponse } from "next/server";
import { listCompletedSiteChangelogEntries } from "@/lib/site-changelog";

export const dynamic = "force-dynamic";

/** Public completed (non-today) user-facing changelog entries, newest first (admin-only items stripped). */
export async function GET() {
  const entries = await listCompletedSiteChangelogEntries(undefined, undefined, {
    audience: "public",
  });
  return NextResponse.json({ entries });
}
