export const SITE_NAME = "Track Anime";
export const SITE_LOGO_PATH = "/logo.webp";
export const SITE_LOGO_ALT = SITE_NAME;
export const SITE_LOGO_ROTATION_PUBLIC_PATH = "/brand-logos";
export const SITE_LOGO_RANDOM_API_PATH = "/api/site-logo/random";

export { SITE_LOGO_VERSION } from "./site-brand.generated";

import { SITE_LOGO_VERSION } from "./site-brand.generated";

export function siteLogoSrc(path: string = SITE_LOGO_PATH): string {
  return `${path}?v=${SITE_LOGO_VERSION}`;
}

export function versionedAsset(path: string): string {
  return `${path}?v=${SITE_LOGO_VERSION}`;
}
