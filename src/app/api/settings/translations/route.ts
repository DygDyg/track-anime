import { NextResponse } from "next/server";
import { getDistinctTranslationNames } from "@/lib/translations-catalog";

export async function GET() {
  const names = await getDistinctTranslationNames();

  return NextResponse.json(
    { names },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
