import { isShikimoriMissingImage } from "@/lib/shikimori/client";
import {
  buildWorldArtPosterUrl,
  parseWorldArtLink,
  type WorldArtSection,
} from "@/lib/world-art-poster";

export type MaterialPosterSource = {
  anime_poster_url?: string | null;
  poster_url?: string | null;
  worldart_poster_url?: string | null;
  worldart_link?: string | null;
  worldart_animation_id?: string | number | null;
  worldart_cinema_id?: string | number | null;
};

function normalizePosterCandidate(url: string | null | undefined): string | null {
  if (!url || isShikimoriMissingImage(url)) return null;
  return url;
}

function parsePositiveInt(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function posterFromWorldArtIds(data: MaterialPosterSource): string | null {
  const animationId = parsePositiveInt(data.worldart_animation_id);
  if (animationId) return buildWorldArtPosterUrl("animation", animationId);

  const cinemaId = parsePositiveInt(data.worldart_cinema_id);
  if (cinemaId) return buildWorldArtPosterUrl("cinema", cinemaId);

  return null;
}

export function resolveMaterialPosterUrl(
  data: MaterialPosterSource | null | undefined,
): string | null {
  if (!data) return null;

  const direct =
    normalizePosterCandidate(data.anime_poster_url) ??
    normalizePosterCandidate(data.poster_url) ??
    normalizePosterCandidate(data.worldart_poster_url);
  if (direct) return direct;

  const link = typeof data.worldart_link === "string" ? data.worldart_link.trim() : "";
  if (link) {
    const parsed = parseWorldArtLink(link);
    if (parsed) return buildWorldArtPosterUrl(parsed.section, parsed.id);
  }

  return posterFromWorldArtIds(data);
}

export function mergeMaterialPosterFields(
  materialData: MaterialPosterSource | null | undefined,
  fields: {
    worldart_link?: string | null;
    worldart_animation_id?: string | number | null;
    worldart_cinema_id?: string | number | null;
  },
): MaterialPosterSource {
  return {
    ...(materialData ?? {}),
    ...(fields.worldart_link ? { worldart_link: fields.worldart_link } : {}),
    ...(fields.worldart_animation_id != null && fields.worldart_animation_id !== ""
      ? { worldart_animation_id: fields.worldart_animation_id }
      : {}),
    ...(fields.worldart_cinema_id != null && fields.worldart_cinema_id !== ""
      ? { worldart_cinema_id: fields.worldart_cinema_id }
      : {}),
  };
}

export function getWorldArtLink(data: MaterialPosterSource | null | undefined): string | null {
  if (!data) return null;
  const link = typeof data.worldart_link === "string" ? data.worldart_link.trim() : "";
  if (link) return link;

  const animationId = parsePositiveInt(data.worldart_animation_id);
  if (animationId) return buildWorldArtLink("animation", animationId);

  const cinemaId = parsePositiveInt(data.worldart_cinema_id);
  if (cinemaId) return buildWorldArtLink("cinema", cinemaId);

  return null;
}

function buildWorldArtLink(section: WorldArtSection, id: number): string {
  return `http://www.world-art.ru/${section}/${section}.php?id=${id}`;
}
