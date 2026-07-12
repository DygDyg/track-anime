import { NextResponse } from "next/server";
import { getActiveBrandAsset, listBrandLogoFiles } from "@/lib/brand-rotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogoResponse = {
  src: string | null;
  count: number;
};

export async function GET() {
  try {
    const [brand, files] = await Promise.all([getActiveBrandAsset(), listBrandLogoFiles()]);

    return NextResponse.json<LogoResponse>(
      { src: brand.logoSrc, count: files.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.warn("[site-logo/random] failed to read logo rotation folder:", error);
    return NextResponse.json<LogoResponse>(
      { src: null, count: 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
