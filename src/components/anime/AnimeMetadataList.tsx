import type { AnimePageDto } from "@/lib/anime-page";
import { AnimeStudioLogos } from "@/components/anime/AnimeStudioLogos";
import {
  formatDurationRu,
} from "@/lib/anime-labels";
import { GenreInfoLink } from "@/components/GenreInfoLink";

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
          <GenreInfoLink genre={genre.name} className="transition hover:underline">
            {genre.name}
          </GenreInfoLink>
        </span>
      ))}
    </>
  );
}

export function AnimeMetadataList({ anime }: { anime: AnimePageDto }) {
  const durationValue = formatDurationRu(anime.duration);

  return (
    <div className="mt-4 space-y-1">
      <MetadataRow label="Длительность" value={durationValue} />
      {anime.studios.length > 0 ? (
        <div className="text-sm leading-relaxed">
          <p className="text-foreground">Студии:</p>
          <div className="mt-1.5">
            <AnimeStudioLogos studios={anime.studios} />
          </div>
        </div>
      ) : null}
      <MetadataRow label="Жанры" value={anime.genres.length > 0 ? <GenreValue genres={anime.genres} /> : null} />
    </div>
  );
}
