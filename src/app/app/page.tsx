import type { Metadata } from "next";
import { AndroidAppDownloadSection } from "@/components/AndroidAppDownloadSection";
import { SITE_NAME } from "@/lib/site-brand";

const title = "Приложение для Android";
const description = "Страница загрузки приложения Track Anime для телефона, планшета и Android TV.";
const appPageUrl = "https://track-anime.dygdyg.ru/app";
const socialImageUrl = "https://track-anime.dygdyg.ru/app/og.png";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: appPageUrl },
  openGraph: {
    type: "website",
    title,
    description,
    url: appPageUrl,
    siteName: SITE_NAME,
    locale: "ru_RU",
    images: [
      {
        url: socialImageUrl,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Приложение Track Anime для Android",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} — ${SITE_NAME}`,
    description,
    images: [socialImageUrl],
  },
};

export default function AppPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <AndroidAppDownloadSection />
    </div>
  );
}
