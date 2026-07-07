export type PwaNavItem = {
  href: string;
  label: string;
  shortcutDescription: string;
};

export const PWA_NAV_ITEMS: PwaNavItem[] = [
  {
    href: "/",
    label: "Главная",
    shortcutDescription: "Новые серии и релизы",
  },
  {
    href: "/calendar",
    label: "Календарь",
    shortcutDescription: "Расписание выхода серий",
  },
  {
    href: "/history",
    label: "История",
    shortcutDescription: "Продолжить просмотр",
  },
  {
    href: "/favorites",
    label: "Избранное",
    shortcutDescription: "Списки Shikimori",
  },
];

export const PWA_EXTRA_SHORTCUTS: PwaNavItem[] = [
  {
    href: "/search",
    label: "Поиск",
    shortcutDescription: "Найти аниме",
  },
];

export function isPwaNavHiddenPath(pathname: string): boolean {
  return pathname === "/login";
}

export function isPwaNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Tailwind `md` — совпадает с скрытием десктоп-навигации в Header. */
export const MOBILE_BOTTOM_NAV_MEDIA = "(max-width: 767px)";

export function shouldShowBottomNav(
  pathname: string,
  options: { mobileViewport: boolean; standalone: boolean },
): boolean {
  if (isPwaNavHiddenPath(pathname)) return false;
  return options.mobileViewport || options.standalone;
}
