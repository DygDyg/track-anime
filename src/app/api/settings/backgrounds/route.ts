import { NextResponse } from "next/server";
import { listPatternBackgroundEntries } from "@/lib/pattern-backgrounds";

export async function GET() {
  const backgrounds = listPatternBackgroundEntries().map(({ url, label }) => ({ url, label }));

  return NextResponse.json(
    { backgrounds },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
