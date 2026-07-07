"use client";

import { ageRatingBadgeClass, labelRating, ratingDescription } from "@/lib/anime-labels";

type Props = {
  rating: string | null;
  className?: string;
};

export function AnimeAgeRatingBadge({ rating, className = "" }: Props) {
  if (!rating || rating === "none") return null;

  const label = labelRating(rating);
  if (!label) return null;

  const description = ratingDescription(rating);

  return (
    <span className="group/rating relative inline-flex">
      <span
        className={[
          "anime-age-rating-badge",
          ageRatingBadgeClass(rating),
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={description ? 0 : undefined}
        aria-label={`Возрастной рейтинг: ${label}`}
      >
        {label}
      </span>
      {description ? (
        <span
          role="tooltip"
          className="anime-rating-tooltip pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-40 w-max max-w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-2 text-center text-[11px] leading-snug text-foreground opacity-0 shadow-lg shadow-black/30 transition-opacity duration-150 group-hover/rating:opacity-100 group-focus-within/rating:opacity-100"
        >
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            {label}
          </span>
          {description}
        </span>
      ) : null}
    </span>
  );
}
