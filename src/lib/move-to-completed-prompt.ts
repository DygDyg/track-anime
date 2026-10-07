const DISMISS_KEY_PREFIX = "ta:move-to-completed-dismiss:";

export function moveToCompletedDismissKey(shikimoriId: number): string {
  return `${DISMISS_KEY_PREFIX}${shikimoriId}`;
}

export function isMoveToCompletedDismissed(shikimoriId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(moveToCompletedDismissKey(shikimoriId)) === "1";
  } catch {
    return false;
  }
}

export function dismissMoveToCompletedPrompt(shikimoriId: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(moveToCompletedDismissKey(shikimoriId), "1");
  } catch {
    /* ignore */
  }
}

/**
 * Не предлагать «в Просмотрено» на середине онгоинга, даже если в Kodik
 * это последняя вышедшая серия.
 */
export function canOfferMoveToCompleted(input: {
  animeStatus: string | null | undefined;
  episodeNumber: number;
  episodesTotal: number | null | undefined;
}): boolean {
  const status = input.animeStatus?.trim().toLowerCase() ?? "";
  const stillAiring = status === "ongoing" || status === "anons";
  if (
    stillAiring &&
    input.episodesTotal != null &&
    input.episodeNumber < input.episodesTotal
  ) {
    return false;
  }
  return true;
}
