import fs from "fs";
import { type NextRequest, NextResponse } from "next/server";
import { getCoverCacheRuntimeSettings } from "@/lib/admin/cover-cache-settings";
import {
  buildCachedCoverResponse,
  buildCoverBufferResponse,
  ensureCoverThumb,
  fetchAndCacheCover,
  readCoverCacheStats,
  resizeCoverToThumbBuffer,
  resolveCoverSourceUrl,
} from "@/lib/cover-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const idRaw = params.get("id");
    const url = params.get("url") ?? undefined;
    const force = params.get("force") === "true";
    const debug = params.get("debug") === "1";
    const size = params.get("size") === "thumb" ? "thumb" : "full";

    const shikimoriId = idRaw ? Number(idRaw) : undefined;
    if (idRaw && (!Number.isFinite(shikimoriId) || shikimoriId! <= 0)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    if (!shikimoriId && !url) {
      return NextResponse.json(readCoverCacheStats());
    }

    const settings = await getCoverCacheRuntimeSettings();
    const result = await fetchAndCacheCover({ shikimoriId, url, force, settings });

    if (!result) {
      if (!settings.enabled && shikimoriId) {
        const directUrl = await resolveCoverSourceUrl({ shikimoriId, url });
        if (directUrl) {
          return NextResponse.redirect(directUrl, 302);
        }
      }

      if (debug) {
        return NextResponse.json({
          status: "error",
          message: "Image not found",
          source: "none",
        });
      }
      return new NextResponse("Image not found", { status: 404 });
    }

    if (debug) {
      const stat = fs.existsSync(result.filePath) ? fs.statSync(result.filePath) : null;
      return NextResponse.json({
        status: result.cached ? "cached" : "ok",
        source: result.source,
        file: result.filePath,
        size: stat?.size ?? result.buffer?.length ?? 0,
        cacheEnabled: settings.enabled,
        maxAgeDays: settings.maxAgeDays,
      });
    }

    if (result.buffer) {
      if (size === "thumb") {
        const thumbBuffer = await resizeCoverToThumbBuffer(result.buffer, settings);
        if (!thumbBuffer) {
          return new NextResponse("Image not found", { status: 404 });
        }
        return buildCoverBufferResponse(
          thumbBuffer,
          `${result.filePath}:thumb`,
          request,
          settings.browserCacheSec,
        );
      }

      return buildCoverBufferResponse(
        result.buffer,
        result.filePath,
        request,
        settings.browserCacheSec,
      );
    }

    if (size === "thumb" && shikimoriId) {
      const thumbPath = await ensureCoverThumb(shikimoriId, result.filePath, settings);
      if (thumbPath) {
        return buildCachedCoverResponse(thumbPath, request, settings.browserCacheSec);
      }
    }

    return buildCachedCoverResponse(result.filePath, request, settings.browserCacheSec);
  } catch (error) {
    console.error("[api/cover]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cover error" },
      { status: 500 },
    );
  }
}
