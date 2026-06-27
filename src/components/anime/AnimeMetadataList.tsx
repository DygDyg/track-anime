import Link from "next/link";
import type { AnimePageDto } from "@/lib/anime-page";
import {
  formatDurationRu,
  formatReleaseYear,
  labelRating,
  labelStatus,
} from "@/lib/anime-labels";
import { buildSearchHref } from "@/lib/search-shared";

function MetadataRow({ label, value }: { label: string; value: React.ReactNode | null }) {
  if (value == null || value === "") return null;

  return (
    <p className="text-sm leading-relaxed">
      <span className="text-foreground">{label}:</span>{" "}
      <span className="font-medium text-accent">{value}</span>
    </p>
  );
}

function GenreValue({ genres }: { genres: AnimePageDto["genres"] }) {
  if (genres.length === 0) return null;

  return (
    <>
      {genres.map((genre, index) => (
        <span key={genre.id}>
          {index > 0 ? ", " : null}
          <Link
            href={buildSearchHref({ genre: genre.name })}
            className="transition hover:underline"
          >
            {genre.name}
          </Link>
        </span>
      ))}
    </>
  );
}

export function AnimeMetadataList({ anime }: { anime: AnimePageDto }) {
  const durationValue = formatDurationRu(anime.duration);
  const studioValue = anime.studios.map((studio) => studio.name).join(", ") || null;
  const dubberValue = anime.dubbers.length > 0 ? anime.dubbers.join(", ") : null;
  const yearValue = formatReleaseYear(anime.airedOn, anime.releasedOn);
  const statusValue = labelStatus(anime.status) ?? anime.status;
  const ratingValue = labelRating(anime.rating) ?? anime.rating;

  return (
    <div className="mt-4 space-y-1">
      <MetadataRow label="Длительность" value={durationValue} />
      <MetadataRow label="Студии" value={studioValue} />
      <MetadataRow label="Дабберы" value={dubberValue} />
      <MetadataRow label="Год выхода" value={yearValue} />
      <MetadataRow label="Жанры" value={anime.genres.length > 0 ? <GenreValue genres={anime.genres} /> : null} />
      <MetadataRow label="Статус" value={statusValue} />
      <MetadataRow label="Возрастной рейтинг" value={ratingValue} />
    </div>
  );
}
