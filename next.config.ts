import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["track-anime.dygdyg.ru", "dygdyg.ru"],
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

export default nextConfig;
