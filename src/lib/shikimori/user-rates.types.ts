export type ShikimoriListStatus =
  | "planned"
  | "watching"
  | "rewatching"
  | "completed"
  | "on_hold"
  | "dropped";

export const LIST_STATUS_LABELS: Record<string, string> = {
  watching: "Смотрю",
  planned: "Запланировано",
  completed: "Просмотрено",
  on_hold: "Отложено",
  dropped: "Брошено",
  rewatching: "Пересматриваю",
  bookmarks: "Закладки",
  all: "Все",
};

/** Короткие подписи вкладок для узких экранов. */
export const LIST_STATUS_LABELS_MOBILE: Record<string, string> = {
  watching: "Смотрю",
  planned: "В планах",
  completed: "Просмотр.",
  on_hold: "Отлож.",
  dropped: "Брошено",
  rewatching: "Пересм.",
  bookmarks: "Закладки",
  all: "Все",
};

export const LIST_STATUS_TABS = [
  "watching",
  "planned",
  "completed",
  "on_hold",
  "dropped",
  "rewatching",
] as const;

export type ListStatusTab = (typeof LIST_STATUS_TABS)[number] | "bookmarks" | "all";
