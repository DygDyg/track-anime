import { type NextRequest, NextResponse } from "next/server";
import {
  buildImageCacheResponse,
  fetchAndCacheImage,
  parseImageCacheKind,
} from "@/lib/image-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const kind = parseImageCacheKind(request.nextUrl.searchParams.get("type"));
  const url = request.nextUrl.searchParams.get("url");

  if (!kind || !url) {
    return NextResponse.json({ error: "Invalid image cache request" }, { status: 400 });
  }

  try {
    const result = await fetchAndCacheImage(kind, url);
    if (!result) {
      return NextResponse.redirect(url, 302);
    }

    return buildImageCacheResponse(result, request);
  } catch (error) {
    console.error("[api/image-cache]", error);
    return NextResponse.redirect(url, 302);
  }
}
