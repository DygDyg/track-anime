import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { bufferToArrayBuffer } from "@/lib/brand-icons";
import { getActiveBrandAsset } from "@/lib/brand-rotation";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getActiveBrandAsset();
  const sourcePath = brand.file?.absolutePath ?? path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo.webp");
  const body = await fs.readFile(/* turbopackIgnore: true */ sourcePath);

  return new NextResponse(bufferToArrayBuffer(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      ETag: `"${brand.cacheKey}"`,
    },
  });
}
