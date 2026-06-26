const KIND_BADGE_BASE =
  "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ring-1";

/** Цвета типа аниме на карточках (OVA, спешл, остальное). */
export function kindBadgeClass(kind: string | null | undefined): string | null {
  if (!kind) return null;

  switch (kind.toLowerCase()) {
    case "ova":
      return `${KIND_BADGE_BASE} border-[#6d28d9]/90 bg-[#7c3aed] text-white ring-[#a78bfa]/50`;
    case "special":
      return `${KIND_BADGE_BASE} border-[#be185d]/90 bg-[#db2777] text-white ring-[#f472b6]/50`;
    default:
      return `${KIND_BADGE_BASE} border-[#525252]/90 bg-[#525252] text-white ring-[#737373]/50`;
  }
}
