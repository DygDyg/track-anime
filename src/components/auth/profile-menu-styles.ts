function profileMenuItemAlign(centered: boolean) {
  return centered ? "justify-center text-center" : "text-left";
}

export function profileMenuItemClass(active: boolean, centered = false) {
  return [
    "flex w-full items-center rounded-md px-3 py-2.5 text-sm transition-colors",
    profileMenuItemAlign(centered),
    active
      ? "bg-accent/10 text-accent hover:bg-accent/15 active:bg-accent/20"
      : "text-foreground hover:bg-surface-dim active:bg-surface-dim",
  ].join(" ");
}

export function profileMenuLogoutClass(centered = false) {
  return [
    "flex w-full items-center rounded-md px-3 py-2.5 text-sm text-muted transition-colors",
    profileMenuItemAlign(centered),
    "hover:bg-surface-dim hover:text-foreground active:bg-surface-dim",
  ].join(" ");
}
