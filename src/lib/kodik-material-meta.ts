type MaterialData = Record<string, unknown>;

export function normalizeKodikGenreKey(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function parseKodikGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = normalizeKodikGenreKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    genres.push(item.trim());
    if (genres.length === 12) break;
  }
  return genres;
}

export function parseKodikStudios(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export type KodikMaterialMeta = {
  description: string | null;
  genres: string[];
  studios: string[];
};

export function extractKodikMaterialMeta(materialDataList: unknown[]): KodikMaterialMeta {
  let description: string | null = null;
  const genres = new Set<string>();
  const studios = new Set<string>();

  for (const raw of materialDataList) {
    if (!raw || typeof raw !== "object") continue;
    const data = raw as MaterialData;

    if (!description) {
      const text = data.anime_description ?? data.description;
      if (typeof text === "string" && text.trim()) {
        description = text.trim();
      }
    }

    for (const genre of parseKodikGenres(data.anime_genres ?? data.all_genres ?? data.genres)) {
      genres.add(genre);
    }

    for (const studio of parseKodikStudios(data.anime_studios ?? data.studios)) {
      studios.add(studio);
    }
  }

  return {
    description,
    genres: [...genres],
    studios: [...studios],
  };
}
