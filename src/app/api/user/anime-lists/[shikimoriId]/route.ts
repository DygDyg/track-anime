import { NextRequest, NextResponse } from "next/server";
import { normalizeRewatchesInput } from "@/lib/anime-rewatches";
import { getSession } from "@/lib/auth/session";
import {
  incrementUserAnimeRewatch,
  isListMutationAuthError,
  removeUserAnimeFromAllLists,
  removeUserAnimeListStatus,
  setUserAnimeBookmark,
  setUserAnimeListStatus,
  setUserAnimeRewatches,
  setUserAnimeScore,
} from "@/lib/shikimori/user-list-mutations";
import { LIST_STATUS_TABS, type ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";
import { getUserAnimeListStatus } from "@/lib/user-anime-list-status";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function isListStatus(value: string): value is ShikimoriListStatus {
  return (LIST_STATUS_TABS as readonly string[]).includes(value);
}

function parseScoreInput(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const score = Math.round(value);
  if (score < 0 || score > 10) return null;
  return score;
}

type UpdateBody = {
  listStatus?: string | null;
  bookmark?: boolean;
  removeAll?: boolean;
  rewatch?: boolean;
  rewatches?: number;
  /** 0 = сбросить; 1–10 = оценка */
  score?: number;
};

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  if (
    body.listStatus === undefined &&
    body.bookmark === undefined &&
    !body.removeAll &&
    !body.rewatch &&
    body.rewatches === undefined &&
    body.score === undefined
  ) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  try {
    let listInfo = await getUserAnimeListStatus(session.user.id, shikimoriId);

    if (body.removeAll) {
      listInfo = await removeUserAnimeFromAllLists(
        session.user.id,
        session.user.shikimoriId,
        shikimoriId,
      );
      return NextResponse.json({ listInfo });
    }

    if (body.rewatch) {
      listInfo = await incrementUserAnimeRewatch(
        session.user.id,
        session.user.shikimoriId,
        shikimoriId,
      );
      return NextResponse.json({ listInfo });
    }

    if (body.rewatches !== undefined) {
      const normalized = normalizeRewatchesInput(body.rewatches);
      if (normalized == null) {
        return NextResponse.json({ error: "Укажите число от 1 до 999" }, { status: 400 });
      }
      listInfo = await setUserAnimeRewatches(
        session.user.id,
        session.user.shikimoriId,
        shikimoriId,
        normalized,
      );
      return NextResponse.json({ listInfo });
    }

    if (body.score !== undefined) {
      const score = parseScoreInput(body.score);
      if (score == null) {
        return NextResponse.json({ error: "Оценка должна быть от 0 до 10" }, { status: 400 });
      }
      listInfo = await setUserAnimeScore(
        session.user.id,
        session.user.shikimoriId,
        shikimoriId,
        score,
      );
      return NextResponse.json({ listInfo });
    }

    if (body.listStatus !== undefined) {
      if (body.listStatus === null) {
        listInfo = await removeUserAnimeListStatus(
          session.user.id,
          session.user.shikimoriId,
          shikimoriId,
        );
      } else if (isListStatus(body.listStatus)) {
        listInfo = await setUserAnimeListStatus(
          session.user.id,
          session.user.shikimoriId,
          shikimoriId,
          body.listStatus,
        );
      } else {
        return NextResponse.json({ error: "Некорректный статус списка" }, { status: 400 });
      }
    }

    if (typeof body.bookmark === "boolean") {
      listInfo = await setUserAnimeBookmark(
        session.user.id,
        session.user.shikimoriId,
        shikimoriId,
        body.bookmark,
      );
    }

    return NextResponse.json({ listInfo });
  } catch (error) {
    if (isListMutationAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Не удалось обновить список";
    console.error("[user/anime-lists] update failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
