export const AVATAR_DECORATION_IDS = [
  "01f04863-8675-49f0-95ff-2ae4c76635f5",
  "0745e3a1-78fd-4da4-aaba-bc1e7b5f9f48",
  "1b5557ff-1c93-48b8-a078-6a266531b07b",
  "239cfd13-17fe-4b0d-b9fd-c29dd3c9b6bc",
  "2aa4c30f-bea2-4770-a210-2b1a0a20808f",
  "395f1f1d-c790-4835-b2fa-9259b9380d04",
  "5277efaf-c855-4692-895f-acc660cc5d77",
  "6aab6ca0-3718-4b0a-8c7c-6c17de98f4f2",
  "8111faf0-0b82-4477-8003-1a8285d8074c",
  "854a1aca-9d5f-4653-908e-48111d52497b",
  "8e316d03-2c5e-45a8-b0f2-141bb931d5b2",
  "99d60806-4e5c-44db-a5cd-93908f3b3c99",
  "a8019ab0-8b9c-4170-a5a5-79a79784e64b",
  "d0a1c24b-45fd-4687-83e8-399a637daf25",
  "e275401a-09b7-44c1-b23a-83e5e65f4308",
  "e3721eb4-93fc-4390-a8ee-b16a9a27a936",
  "e53c0c67-9719-426c-8faf-0db7aa27abfb",
  "f1ae75d4-749c-49d3-ad92-03067cba1718",
  "fd42a7ac-bfa6-41ea-8b99-eee82477c03e",
] as const;

export type AvatarDecorationId = (typeof AVATAR_DECORATION_IDS)[number];

const AVATAR_DECORATION_ID_SET = new Set<string>(AVATAR_DECORATION_IDS);

export const AVATAR_DECORATION_OPTIONS: { id: AvatarDecorationId; label: string }[] =
  AVATAR_DECORATION_IDS.map((id, index) => ({
    id,
    label: `Украшение ${index + 1}`,
  }));

export type AvatarDecorationVariant = "thumb" | "display" | "full";

export function avatarDecorationUrl(
  id: string | null | undefined,
  variant: AvatarDecorationVariant = "full",
): string | null {
  if (!id || !AVATAR_DECORATION_ID_SET.has(id)) return null;
  switch (variant) {
    case "thumb":
      return `/avatar-decorations/thumbs/${id}.webp`;
    case "display":
      return `/avatar-decorations/display/${id}.webp`;
    case "full":
      return `/avatar-decorations/${id}.png`;
  }
}

export function normalizeAvatarDecorationId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return AVATAR_DECORATION_ID_SET.has(value) ? value : null;
}
