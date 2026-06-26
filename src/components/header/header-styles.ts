/** Плоский стиль контролов верхней панели — без «коробочных» рамок */
export const headerControl = {
  height: "h-10",
  icon:
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground",
  text:
    "inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-foreground transition hover:bg-foreground/5 sm:px-3",
  textMuted:
    "inline-flex h-10 items-center rounded-md px-2.5 text-sm font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground sm:px-3",
  primary:
    "inline-flex h-10 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white transition hover:bg-accent/90",
  nav: (active: boolean) =>
    active
      ? "relative inline-flex h-10 items-center px-3 text-sm font-medium text-accent after:absolute after:inset-x-2 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent"
      : "inline-flex h-10 items-center px-3 text-sm font-medium text-foreground/75 transition hover:text-foreground",
  navMobile: (active: boolean) =>
    active
      ? "flex h-10 w-full items-center border-l-2 border-accent bg-accent/10 pl-3 pr-2 text-sm font-medium text-accent"
      : "flex h-10 w-full items-center border-l-2 border-transparent pl-3 pr-2 text-sm font-medium text-foreground/80 transition hover:bg-foreground/5 hover:text-foreground",
  searchInput:
    "site-search-input h-10 w-full rounded-md border-0 border-b border-border/80 bg-transparent py-0 pl-9 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:bg-foreground/[0.03]",
  skeleton: "inline-block h-10 w-[5.5rem] animate-pulse rounded-md bg-foreground/10",
  avatar: "h-7 w-7 shrink-0 rounded-full object-cover",
  avatarFallback:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent",
} as const;
