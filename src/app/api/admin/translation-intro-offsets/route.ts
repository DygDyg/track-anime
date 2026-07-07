import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  TRANSLATION_INTRO_OFFSET_MAX_SEC,
  TRANSLATION_INTRO_OFFSET_MIN_SEC,
  clampTranslationIntroOffsetSec,
} from "@/lib/translation-intro-offset";
import {
  applyTranslationIntroOffsetToAllUsers,
  getTranslationIntroSettingsDto,
  updateForcedTranslationIntroOffset,
} from "@/lib/admin/translation-intro-offsets";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const data = await getTranslationIntroSettingsDto();
  return NextResponse.json({
    ...data,
    minSeconds: TRANSLATION_INTRO_OFFSET_MIN_SEC,
    maxSeconds: TRANSLATION_INTRO_OFFSET_MAX_SEC,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as { translationName?: unknown; forcedSeconds?: unknown };

  if (typeof input.translationName !== "string" || !input.translationName.trim()) {
    return NextResponse.json({ error: "Укажите название озвучки" }, { status: 400 });
  }

  if (input.forcedSeconds === undefined) {
    return NextResponse.json({ error: "Укажите forcedSeconds" }, { status: 400 });
  }

  const forcedSeconds = Number(input.forcedSeconds);
  if (!Number.isFinite(forcedSeconds)) {
    return NextResponse.json({ error: "Некорректное значение секунд" }, { status: 400 });
  }

  const clamped = clampTranslationIntroOffsetSec(forcedSeconds);
  if (clamped !== Math.round(forcedSeconds)) {
    return NextResponse.json(
      {
        error: `Секунды: от ${TRANSLATION_INTRO_OFFSET_MIN_SEC} до ${TRANSLATION_INTRO_OFFSET_MAX_SEC}`,
      },
      { status: 400 },
    );
  }

  const data = await updateForcedTranslationIntroOffset(input.translationName, clamped);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as {
    action?: unknown;
    translationName?: unknown;
    seconds?: unknown;
  };

  if (input.action !== "applyToAll") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  if (typeof input.translationName !== "string" || !input.translationName.trim()) {
    return NextResponse.json({ error: "Укажите название озвучки" }, { status: 400 });
  }

  if (input.seconds === undefined) {
    return NextResponse.json({ error: "Укажите seconds" }, { status: 400 });
  }

  const seconds = Number(input.seconds);
  if (!Number.isFinite(seconds)) {
    return NextResponse.json({ error: "Некорректное значение секунд" }, { status: 400 });
  }

  const clamped = clampTranslationIntroOffsetSec(seconds);
  const result = await applyTranslationIntroOffsetToAllUsers(input.translationName, clamped);
  const data = await getTranslationIntroSettingsDto();

  return NextResponse.json({
    ...data,
    updatedUsers: result.updatedUsers,
  });
}
