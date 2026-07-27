export type CompanionAnimation =
  | "idle"
  | "work"
  | "runRight"
  | "runLeft"
  | "wave"
  | "jump"
  | "error"
  | "waiting"
  | "review"
  | "lying"
  | "sleeping"
  | "searching"
  | "reading"
  | "celebrate"
  | "calendar"
  | "history"
  | "favorites"
  | "appear"
  | "leave"
  | "jumpRopeLoading"
  | "sitting"
  | "sittingPlay"
  | "sittingPause";

export type CompanionReactionOptions = {
  /** Skip if the same animation was requested recently. */
  force?: boolean;
};

type CompanionReactionListener = (
  animation: CompanionAnimation,
  options?: CompanionReactionOptions,
) => void;

const listeners = new Set<CompanionReactionListener>();

/** Stable loop animation for the current route / tab. */
export function getCompanionSituation(pathname: string): CompanionAnimation {
  if (pathname.startsWith("/anime/")) return "sitting";
  if (pathname.startsWith("/search")) return "searching";
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/history")) return "history";
  if (pathname.startsWith("/calendar")) return "calendar";
  return "idle";
}

/** Fire-and-forget site → companion cue. No-op when companion is off / unmounted. */
export function emitCompanionReaction(
  animation: CompanionAnimation,
  options?: CompanionReactionOptions,
): void {
  for (const listener of listeners) {
    listener(animation, options);
  }
}

export function emitCompanionSituation(
  pathname: string,
  options?: CompanionReactionOptions,
): void {
  emitCompanionReaction(getCompanionSituation(pathname), options);
}

export function subscribeCompanionReactions(listener: CompanionReactionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
