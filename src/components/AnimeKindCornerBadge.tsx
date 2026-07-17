type AnimeKindCornerBadgeProps = {
  kind: string | null | undefined;
  className?: string;
};

function getKindBadge(
  kind: string | null | undefined,
): { label: string; title: string; className: string } | null {
  const normalized = kind?.trim().toLowerCase();
  if (normalized === "movie") {
    return {
      label: "M",
      title: "Фильм",
      className: "border-[#c2410c]/90 bg-[#ea580c] text-white",
    };
  }
  if (normalized === "special") {
    return {
      label: "S",
      title: "Спешл",
      className: "border-[#be185d]/90 bg-[#db2777] text-white",
    };
  }
  return null;
}

export function AnimeKindCornerBadge({ kind, className = "" }: AnimeKindCornerBadgeProps) {
  const badge = getKindBadge(kind);
  if (!badge) return null;

  return (
    <span
      title={badge.title}
      aria-label={badge.title}
      className={[
        "pointer-events-none inline-flex items-center justify-center rounded-tr-2xl border px-2 py-1 backdrop-blur-[2px] sm:px-2.5 sm:py-1.5",
        badge.className,
        className,
      ].join(" ")}
    >
      <span className="text-lg font-bold leading-none tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] sm:text-xl md:text-2xl">
        {badge.label}
      </span>
    </span>
  );
}
