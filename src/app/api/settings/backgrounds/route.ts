import { NextResponse } from "next/server";
import { listBackgroundImageEntries } from "@/lib/background-images";

export async function GET() {
  const backgrounds = listBackgroundImageEntries();

  return NextResponse.json(
    { backgrounds },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
