import { NextResponse } from "next/server";
import { getForcedTranslationIntroOffsets } from "@/lib/admin/translation-intro-offsets";

export const dynamic = "force-dynamic";

export async function GET() {
  const forcedOffsets = await getForcedTranslationIntroOffsets();

  return NextResponse.json(
    { forcedOffsets },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
