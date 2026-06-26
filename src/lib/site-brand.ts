export const SITE_NAME = "Track Anime";
export const SITE_LOGO_PATH = "/logo.png";
export const SITE_LOGO_ALT = SITE_NAME;

export { SITE_LOGO_VERSION } from "./site-brand.generated";

import { SITE_LOGO_VERSION } from "./site-brand.generated";

export function siteLogoSrc(path: string = SITE_LOGO_PATH): string {
  return `${path}?v=${SITE_LOGO_VERSION}`;
}

export function versionedAsset(path: string): string {
  return `${path}?v=${SITE_LOGO_VERSION}`;
}
