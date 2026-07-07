import fs from "fs";
import { type NextRequest, NextResponse } from "next/server";
import { getCoverCacheRuntimeSettings } from "@/lib/admin/cover-cache-settings";
import {
  buildCachedCoverResponse,
  buildCoverBufferResponse,
  fetchAndCacheCover,
  getFreshCoverCachePath,
  getFreshCoverThumbPath,
  readCoverCacheStats,
  resizeCoverToThumbBuffer,
  resolveCoverSourceUrl,
  resolveCoverSourceUrlQuick,
  resolveCoverThumbAsset,
  scheduleCoverCacheFill,
} from "@/lib/cover-cache";
import { pickThumbDirectUrl } from "@/lib/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function respondCoverThumb(
  request: NextRequest,
  shikimoriId: number,
  url: string | undefined,
  settings: Awaited<ReturnType<typeof getCoverCacheRuntimeSettings>>,
): Promise<Response> {
  const cachedMainPath = getFreshCoverCachePath(shikimoriId, settings);
  if (cachedMainPath) {
    const thumbAsset = await resolveCoverThumbAsset(shikimoriId, cachedMainPath, settings);
    if (thumbAsset?.kind === "file") {
      return buildCachedCoverResponse(thumbAsset.path, request, settings.browserCacheSec);
    }
    if (thumbAsset?.kind === "buffer") {
      return buildCoverBufferResponse(
        thumbAsset.buffer,
        `${cachedMainPath}:thumb`,
        request,
        settings.browserCacheSec,
      );
    }
  }

  scheduleCoverCacheFill({ shikimoriId, url, settings });
  const quickUrl = await resolveCoverSourceUrlQuick({ shikimoriId, url });
  if (quickUrl) {
    return NextResponse.redirect(pickThumbDirectUrl(quickUrl), 302);
  }

  return new NextResponse("Image not found", { status: 404 });
}

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

    if (debug) {
      const result = await fetchAndCacheCover({ shikimoriId, url, force, settings });
      if (!result) {
        return NextResponse.json({
          status: "error",
          message: "Image not found",
          source: "none",
        });
      }
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

    if (shikimoriId && settings.enabled && !force) {
      if (size === "thumb") {
        return respondCoverThumb(request, shikimoriId, url, settings);
      }

      const cachedMainPath = getFreshCoverCachePath(shikimoriId, settings);
      if (cachedMainPath) {
        return buildCachedCoverResponse(cachedMainPath, request, settings.browserCacheSec);
      }

      scheduleCoverCacheFill({ shikimoriId, url, force, settings });
      const quickUrl = await resolveCoverSourceUrlQuick({ shikimoriId, url });
      if (quickUrl) {
        return NextResponse.redirect(quickUrl, 302);
      }

      return new NextResponse("Image not found", { status: 404 });
    }

    const result = await fetchAndCacheCover({ shikimoriId, url, force, settings });

    if (!result) {
      if (shikimoriId) {
        const directUrl = await resolveCoverSourceUrl({ shikimoriId, url });
        if (directUrl) {
          return NextResponse.redirect(directUrl, 302);
        }
      }
      return new NextResponse("Image not found", { status: 404 });
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
      const thumbPath = getFreshCoverThumbPath(shikimoriId, result.filePath);
      if (thumbPath) {
        return buildCachedCoverResponse(thumbPath, request, settings.browserCacheSec);
      }
      const thumbAsset = await resolveCoverThumbAsset(shikimoriId, result.filePath, settings);
      if (thumbAsset?.kind === "file") {
        return buildCachedCoverResponse(thumbAsset.path, request, settings.browserCacheSec);
      }
      if (thumbAsset?.kind === "buffer") {
        return buildCoverBufferResponse(
          thumbAsset.buffer,
          `${result.filePath}:thumb`,
          request,
          settings.browserCacheSec,
        );
      }
      const quickUrl = await resolveCoverSourceUrlQuick({ shikimoriId, url });
      if (quickUrl) {
        return NextResponse.redirect(pickThumbDirectUrl(quickUrl), 302);
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
