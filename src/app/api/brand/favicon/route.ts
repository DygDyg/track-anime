import path from "node:path";
import { NextResponse } from "next/server";
import { getActiveBrandAsset } from "@/lib/brand-rotation";
import { bufferToArrayBuffer, renderFaviconIco } from "@/lib/brand-icons";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getActiveBrandAsset();
  const sourcePath =
    brand.file?.absolutePath ?? path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo.webp");
  const body = await renderFaviconIco(sourcePath);

  return new NextResponse(bufferToArrayBuffer(body), {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      ETag: `"${brand.cacheKey}-ico"`,
    },
  });
}
