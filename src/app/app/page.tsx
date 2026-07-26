import type { Metadata } from "next";
import { AndroidAppDownloadSection } from "@/components/AndroidAppDownloadSection";
import { SITE_NAME } from "@/lib/site-brand";
import { toAbsoluteUrl } from "@/lib/site-url";

const title = "Приложение для Android";
const description = "Страница загрузки приложения Track Anime для телефона, планшета и Android TV.";
const qrImageUrl = toAbsoluteUrl("/app/qr");

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/app" },
  openGraph: {
    type: "website",
    title,
    description,
    url: "/app",
    siteName: SITE_NAME,
    locale: "ru_RU",
    images: qrImageUrl
      ? [{ url: qrImageUrl, width: 1024, height: 1024, alt: "QR-код страницы приложения Track Anime" }]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} — ${SITE_NAME}`,
    description,
    images: qrImageUrl ? [qrImageUrl] : undefined,
  },
};

export default function AppPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <AndroidAppDownloadSection />
    </div>
  );
}
