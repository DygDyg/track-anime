import path from "node:path";
import { NextResponse } from "next/server";
import { getActiveBrandAsset } from "@/lib/brand-rotation";
import { bufferToArrayBuffer, renderSquarePng } from "@/lib/brand-icons";

export const dynamic = "force-dynamic";

const ALLOWED_SIZES = new Set([16, 32, 48, 180, 192, 512]);

function parseSize(value: string | null): number {
  const size = Number.parseInt(value ?? "", 10);
  return ALLOWED_SIZES.has(size) ? size : 192;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = parseSize(searchParams.get("size"));
  const brand = await getActiveBrandAsset();
  const sourcePath =
    brand.file?.absolutePath ?? path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo.webp");
  const body = await renderSquarePng(sourcePath, size);

  return new NextResponse(bufferToArrayBuffer(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      ETag: `"${brand.cacheKey}-${size}"`,
    },
  });
}
