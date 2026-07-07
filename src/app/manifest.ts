import type { MetadataRoute } from "next";
import { defaultSiteDescription } from "@/lib/site-metadata";
import { PWA_EXTRA_SHORTCUTS, PWA_NAV_ITEMS } from "@/lib/pwa-nav";
import { SITE_NAME } from "@/lib/site-brand";

const PWA_THEME_COLOR = "#0c0e14";
const PWA_BACKGROUND_COLOR = "#0c0e14";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: "TrackAnime",
    description: defaultSiteDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "ru",
    dir: "ltr",
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_BACKGROUND_COLOR,
    categories: ["entertainment"],
    shortcuts: [...PWA_NAV_ITEMS, ...PWA_EXTRA_SHORTCUTS].map((item) => ({
      name: item.label,
      short_name: item.label,
      description: item.shortcutDescription,
      url: item.href,
      icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    })),
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR };
