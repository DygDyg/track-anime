import { unstable_cache } from "next/cache";
import { shikimoriFetch } from "@/lib/shikimori/client";
import { shikimoriAssetUrl, shikimoriSiteUrl } from "@/lib/shikimori/endpoints";
import type { ShikimoriImage } from "@/lib/shikimori/types";

export type ShikimoriCharacter = {
  id: number;
  name: string;
  russian: string | null;
  image: ShikimoriImage | null;
  description: string | null;
};

export type CharacterHoverPreview = {
  id: number;
  title: string;
  imageUrl: string | null;
  description: string | null;
  profileUrl: string;
};

async function fetchCharacterFromApi(id: number): Promise<ShikimoriCharacter | null> {
  return shikimoriFetch<ShikimoriCharacter>(`/characters/${id}`);
}

export async function getShikimoriCharacter(id: number): Promise<ShikimoriCharacter | null> {
  return unstable_cache(
    async () => fetchCharacterFromApi(id),
    ["shikimori-character", String(id)],
    { revalidate: 86_400 },
  )();
}

export async function buildCharacterHoverPreview(id: number): Promise<CharacterHoverPreview | null> {
  const character = await getShikimoriCharacter(id);
  if (!character) return null;

  const imageUrl = shikimoriAssetUrl(
    character.image?.x96 ?? character.image?.preview ?? character.image?.original ?? null,
  );

  return {
    id: character.id,
    title: character.russian?.trim() || character.name,
    imageUrl,
    description: character.description,
    profileUrl: shikimoriSiteUrl(`/characters/${character.id}`),
  };
}
