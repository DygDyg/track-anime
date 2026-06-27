import type { Metadata } from "next";
import { buildSitePageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Вход",
  description: "Вход через Shikimori на Track Anime",
  canonicalPath: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
