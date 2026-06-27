import { animeScoreBadgeStyle, normalizeAnimeScore, parseAnimeScore } from "@/lib/anime-score";

type Props = {
  score: string | number | null | undefined;
  className?: string;
  size?: "sm" | "md";
  /** overlay — на постере; inline — в строке метаданных */
  variant?: "overlay" | "inline";
};

const SIZE_CLASS = {
  sm: "anime-score-badge-sm",
  md: "anime-score-badge-md",
} as const;

export function AnimeScoreBadge({
  score,
  className = "",
  size = "sm",
  variant = "overlay",
}: Props) {
  const normalized = normalizeAnimeScore(score);
  const parsed = parseAnimeScore(normalized);
  if (parsed == null || !normalized) return null;

  const style = animeScoreBadgeStyle(parsed);

  return (
    <span
      className={[
        "anime-score-badge",
        SIZE_CLASS[size],
        variant === "overlay" ? "anime-score-badge-overlay" : "anime-score-badge-inline",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      title={`Рейтинг Shikimori: ${normalized}`}
    >
      ★ {normalized}
    </span>
  );
}
