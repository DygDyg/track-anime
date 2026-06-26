import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Header } from "@/components/Header";
import { NavigationProgressProvider } from "@/components/NavigationProgress";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { SiteBackground } from "@/components/SiteBackground";
import { ThemeInit } from "@/components/ThemeInit";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SiteSettingsInit } from "@/components/SiteSettingsInit";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { SiteSettingsModal } from "@/components/settings/SiteSettingsModal";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { UserListStatusProvider } from "@/components/favorites/UserListStatusProvider";
import { listBackgroundImageUrls } from "@/lib/background-images";
import { buildDefaultOpenGraph, defaultSiteDescription } from "@/lib/site-metadata";
import { SITE_LOGO_PATH, SITE_NAME, versionedAsset } from "@/lib/site-brand";
import { getSiteUrl } from "@/lib/site-url";
import { siteFontBodyClassName } from "@/lib/site-fonts";
import "./globals.css";
import "./translation-badges.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: defaultSiteDescription,
  openGraph: buildDefaultOpenGraph(),
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: defaultSiteDescription,
    images: [versionedAsset(SITE_LOGO_PATH)],
  },
  icons: {
    icon: [
      { url: versionedAsset("/icon.png"), sizes: "512x512", type: "image/png" },
      { url: versionedAsset("/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: versionedAsset("/favicon-16.png"), sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: versionedAsset("/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
    shortcut: [versionedAsset("/favicon.ico")],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const backgroundUrls = listBackgroundImageUrls();

  return (
    <html lang="ru" suppressHydrationWarning data-theme="dark">
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body
        className={`${siteFontBodyClassName} min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeInit />
        <SiteSettingsInit />
        <ThemeProvider>
          <AuthProvider>
            <SiteSettingsProvider>
              <UserListStatusProvider>
                <SiteBackground urls={backgroundUrls} />
                <NavigationProgressProvider>
                  <Suspense fallback={null}>
                    <ScrollRestoration />
                  </Suspense>
                  <Header />
                  <main className="relative z-10">{children}</main>
                  <SiteSettingsModal />
                </NavigationProgressProvider>
              </UserListStatusProvider>
            </SiteSettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
