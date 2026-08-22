import type { Metadata } from "next";
import { AndroidAppDownloadSection } from "@/components/AndroidAppDownloadSection";
import { SITE_NAME } from "@/lib/site-brand";

const title = "Приложения Track Anime";
const description = "Страница загрузки приложений Track Anime для Android, Android TV и Windows.";
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
        alt: "Приложения Track Anime для Android и Windows",
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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12 lg:max-w-5xl">
      <AndroidAppDownloadSection />
    </div>
  );
}
