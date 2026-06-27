import type { SiteCursorStyle, SiteFontFamily } from "@/lib/site-settings";

export const FONT_PREVIEW_SAMPLE = "АаБбЖж 123";

export const SITE_FONT_STACKS: Record<SiteFontFamily, string> = {
  inter: 'var(--font-sans), "Segoe UI", system-ui, sans-serif',
  system: 'system-ui, "Segoe UI", sans-serif',
  "inter-tight": 'var(--font-inter-tight), "Segoe UI", system-ui, sans-serif',
  tektur: 'var(--font-tektur), "Segoe UI", system-ui, sans-serif',
  "fira-sans": 'var(--font-fira-sans), "Segoe UI", system-ui, sans-serif',
  "roboto-condensed": 'var(--font-roboto-condensed), "Segoe UI", system-ui, sans-serif',
  pangolin: 'var(--font-pangolin), "Segoe UI", system-ui, sans-serif',
  morpheus: 'var(--font-morpheus), "Segoe UI", system-ui, sans-serif',
};

export const SITE_CURSOR_URLS: Record<Exclude<SiteCursorStyle, "default">, string> = {
  large:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M5 3l14 9-6 1-3 7z' fill='%23eef0f4' stroke='%230c0e14' stroke-width='1.5'/%3E%3C/svg%3E",
  accent:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M5 3l14 9-6 1-3 7z' fill='%236c8cff' stroke='%23ffffff' stroke-width='1.5'/%3E%3C/svg%3E",
  retro: "/cursors/retro.png",
};

export const SITE_CURSOR_HOTSPOTS: Record<Exclude<SiteCursorStyle, "default">, [number, number]> = {
  large: [4, 2],
  accent: [4, 2],
  retro: [2, 2],
};

export function siteCursorCss(style: SiteCursorStyle): string | null {
  if (style === "default") return null;
  const url = SITE_CURSOR_URLS[style];
  const [x, y] = SITE_CURSOR_HOTSPOTS[style];
  return `url("${url}") ${x} ${y}, auto`;
}

export function siteCursorPointerCss(style: SiteCursorStyle): string {
  return siteCursorCss(style) ?? "pointer";
}
