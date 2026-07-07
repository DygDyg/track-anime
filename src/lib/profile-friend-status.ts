export type ProfileFriendStatus = "none" | "add" | "pending" | "friends" | "self";

/** Нормализует поле in_friends из Shikimori API. */
export function normalizeProfileFriendStatus(
  raw: unknown,
  options?: { viewingSelf?: boolean },
): ProfileFriendStatus {
  if (options?.viewingSelf) return "self";
  if (raw === true || raw === "friends" || raw === "remove") return "friends";
  if (raw === "pending") return "pending";
  if (raw === "add") return "add";
  return "none";
}

export function profileFriendStatusLabel(status: ProfileFriendStatus): string {
  switch (status) {
    case "friends":
      return "В друзьях";
    case "pending":
      return "Заявка отправлена";
    case "add":
      return "Добавить в друзья на Track Anime";
    case "self":
      return "Это вы";
    default:
      return "Добавить в друзья на Track Anime";
  }
}

export function canAddProfileFriend(status: ProfileFriendStatus): boolean {
  return status === "add" || status === "none";
}

export function canRemoveProfileFriend(status: ProfileFriendStatus): boolean {
  return status === "friends";
}

export function isShikimoriFriendsAccessError(message: string): boolean {
  return /Shikimori API 403: \/friends\//.test(message);
}
