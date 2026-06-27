const KIND_BADGE_BASE =
  "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ring-1";

/** Цвета типа аниме на карточках и в поиске. */
export function kindBadgeClass(kind: string | null | undefined): string | null {
  if (!kind) return null;

  switch (kind.toLowerCase()) {
    case "tv":
    case "tv_13":
    case "tv_24":
    case "tv_48":
      return `${KIND_BADGE_BASE} border-[#1d4ed8]/90 bg-[#2563eb] text-white ring-[#60a5fa]/50`;
    case "movie":
      return `${KIND_BADGE_BASE} border-[#c2410c]/90 bg-[#ea580c] text-white ring-[#fb923c]/50`;
    case "ova":
      return `${KIND_BADGE_BASE} border-[#6d28d9]/90 bg-[#7c3aed] text-white ring-[#a78bfa]/50`;
    case "ona":
      return `${KIND_BADGE_BASE} border-[#0e7490]/90 bg-[#0891b2] text-white ring-[#22d3ee]/50`;
    case "special":
      return `${KIND_BADGE_BASE} border-[#be185d]/90 bg-[#db2777] text-white ring-[#f472b6]/50`;
    case "music":
      return `${KIND_BADGE_BASE} border-[#047857]/90 bg-[#059669] text-white ring-[#34d399]/50`;
    default:
      return `${KIND_BADGE_BASE} border-[#525252]/90 bg-[#525252] text-white ring-[#737373]/50`;
  }
}
