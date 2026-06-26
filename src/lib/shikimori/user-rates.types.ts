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

export const LIST_STATUS_TABS = [
  "watching",
  "planned",
  "completed",
  "on_hold",
  "dropped",
  "rewatching",
] as const;

export type ListStatusTab = (typeof LIST_STATUS_TABS)[number] | "bookmarks" | "all";
