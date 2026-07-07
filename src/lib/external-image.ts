/** Атрибуты для <img> с внешних CDN (Kodik, Shikimori) — без Referer, чтобы не резали hotlink. */
export const EXTERNAL_IMG_ATTRS = {
  referrerPolicy: "no-referrer",
} as const;
