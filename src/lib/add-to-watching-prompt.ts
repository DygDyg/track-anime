const DISMISS_KEY_PREFIX = "ta:add-to-watching-dismiss:";

/** Доля длительности 1-й серии, после которой предлагаем «Смотрю» (как дефолт порога финала). */
export const ADD_TO_WATCHING_THRESHOLD_RATIO = 0.5;

export function addToWatchingDismissKey(shikimoriId: number): string {
  return `${DISMISS_KEY_PREFIX}${shikimoriId}`;
}

export function isAddToWatchingDismissed(shikimoriId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(addToWatchingDismissKey(shikimoriId)) === "1";
  } catch {
    return false;
  }
}

export function dismissAddToWatchingPrompt(shikimoriId: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(addToWatchingDismissKey(shikimoriId), "1");
  } catch {
    /* ignore */
  }
}

export function isPastAddToWatchingThreshold(input: {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
}): boolean {
  if (input.seasonNumber !== 1 || input.episodeNumber !== 1) return false;
  if (input.durationSeconds <= 0) return false;
  return input.positionSeconds > input.durationSeconds * ADD_TO_WATCHING_THRESHOLD_RATIO;
}

/** Статус/тип тайтла позволяют показать плашку (после того как порог уже был пройден). */
export function canOfferAddToWatching(input: {
  listStatus: string | null | undefined;
  episodesTotal: number | null | undefined;
}): boolean {
  const status = input.listStatus?.trim().toLowerCase() ?? "";
  if (status === "watching" || status === "rewatching" || status === "completed") {
    return false;
  }

  // Односерийные (фильм/OVA) — не предлагаем «Смотрю»; там путь «Просмотрено».
  if (input.episodesTotal != null && input.episodesTotal <= 1) {
    return false;
  }

  return true;
}
