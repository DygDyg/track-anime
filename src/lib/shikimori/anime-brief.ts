import { shikimoriAssetUrl } from "@/lib/shikimori/client";
import type { ShikimoriImage } from "@/lib/shikimori/types";

export type ShikimoriAnimeBrief = {
  id: number;
  name: string;
  russian?: string | null;
  image?: ShikimoriImage | string | null;
  url?: string | null;
  kind?: string | null;
  score?: string | null;
  status?: string | null;
  episodes?: number | null;
  episodes_aired?: number | null;
};

export function animeBriefPosterUrl(image: ShikimoriImage | string | null | undefined): string | null {
  if (!image) return null;
  if (typeof image === "string") return shikimoriAssetUrl(image);
  return shikimoriAssetUrl(image.preview ?? image.x96 ?? image.original ?? null);
}

export function animeBriefTitle(item: ShikimoriAnimeBrief): string {
  return item.russian?.trim() || item.name;
}

export function animeBriefPosterPath(image: ShikimoriImage | string | null | undefined): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  return image.preview ?? image.x96 ?? image.original ?? null;
}
