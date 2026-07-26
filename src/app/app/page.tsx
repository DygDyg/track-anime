import type { Metadata } from "next";
import { AndroidAppDownloadSection } from "@/components/AndroidAppDownloadSection";
import { buildSitePageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Приложение для Android",
  description: "Скачайте Track Anime для телефона, планшета или Android TV.",
  canonicalPath: "/app",
});

export default function AppPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <AndroidAppDownloadSection />
    </div>
  );
}
