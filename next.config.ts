import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { getDevAllowedOrigins } from "./scripts/dev-allowed-origins.mjs";

const nextConfig: NextConfig = {
  allowedDevOrigins: getDevAllowedOrigins(),
  async headers() {
    return [
      {
        source: "/downloads/TrackAnimeDiscordRPC.exe",
        headers: [
          {
            key: "Content-Disposition",
            value: 'attachment; filename="TrackAnimeDiscordRPC.exe"',
          },
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
    ];
  },
  images: {
    localPatterns: [
      {
        pathname: "/logo.png",
      },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "shikimori.io" },
      { protocol: "https", hostname: "shikimori.one" },
      { protocol: "https", hostname: "shiki.one" },
      { protocol: "https", hostname: "**.yandex.net" },
      { protocol: "https", hostname: "st.kp.yandex.net" },
      { protocol: "https", hostname: "i.kodikres.com" },
      { protocol: "http", hostname: "www.world-art.ru" },
      { protocol: "http", hostname: "world-art.ru" },
    ],
  },
};

export default withSerwist(nextConfig);
