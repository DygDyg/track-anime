import { NextResponse } from "next/server";
import { getHeaderSearchDebounceMs } from "@/lib/search-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const headerSearchDebounceMs = await getHeaderSearchDebounceMs();

  return NextResponse.json(
    { headerSearchDebounceMs },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
