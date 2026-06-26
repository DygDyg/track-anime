import type { ShikimoriImage } from "@/lib/shikimori/types";
import { shikimoriAuthFetch } from "@/lib/shikimori/auth-client";
import { shikimoriAssetUrl } from "@/lib/shikimori/client";

export type ShikimoriFavoriteAnimeBrief = {
  id: number;
  name: string;
  russian?: string | null;
  image?: ShikimoriImage | string | null;
  url?: string;
  kind?: string | null;
  score?: string | null;
  status?: string | null;
  episodes?: number | null;
  episodes_aired?: number | null;
  aired_on?: string | null;
};

export type ShikimoriFavouritesResponse = {
  animes?: ShikimoriFavoriteAnimeBrief[];
  mangas?: unknown[];
  ranobe?: unknown[];
  characters?: unknown[];
  people?: unknown[];
  mangakas?: unknown[];
  seyu?: unknown[];
  producers?: unknown[];
};

export async function fetchUserFavourites(
  userId: string,
  shikimoriUserId: number,
): Promise<ShikimoriFavouritesResponse> {
  return shikimoriAuthFetch<ShikimoriFavouritesResponse>(
    userId,
    `/users/${shikimoriUserId}/favourites`,
  );
}

export function favoriteAnimePosterUrl(image: ShikimoriImage | string | null | undefined): string | null {
  if (!image) return null;
  if (typeof image === "string") return shikimoriAssetUrl(image);
  return shikimoriAssetUrl(image.preview ?? image.x96 ?? image.original ?? null);
}

export function favoriteAnimeTitle(item: ShikimoriFavoriteAnimeBrief): string {
  return item.russian?.trim() || item.name;
}
