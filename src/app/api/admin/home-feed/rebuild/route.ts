import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getHomeFeedMeta,
  rebuildHomeFeedCache,
  scheduleHomeFeedRebuild,
} from "@/lib/home-feed-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const meta = await getHomeFeedMeta();
  return NextResponse.json({ meta });
}

/**
 * POST ?wait=1 — дождаться полной пересборки (до maxDuration).
 * Иначе — запустить в фоне и сразу вернуть статус.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const wait = new URL(request.url).searchParams.get("wait") === "1";

  if (wait) {
    try {
      const meta = await rebuildHomeFeedCache({ mode: "full" });
      revalidateTag("releases", "max");
      return NextResponse.json({
        message: `Лента пересобрана: ${meta.itemCount.toLocaleString("ru-RU")} карточек.`,
        meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка пересборки ленты";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  scheduleHomeFeedRebuild("full");
  const meta = await getHomeFeedMeta();
  revalidateTag("releases", "max");

  return NextResponse.json({
    message:
      meta.status === "building"
        ? "Пересборка общей ленты запущена в фоне. Пока идёт сборка, скролл catalog может быть короче."
        : "Пересборка общей ленты поставлена в очередь.",
    meta,
  });
}
