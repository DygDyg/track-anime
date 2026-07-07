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
import { DiscordSitePresence } from "@/components/DiscordSitePresence";
import { SiteSettingsModal } from "@/components/settings/SiteSettingsModal";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { UserListStatusProvider } from "@/components/favorites/UserListStatusProvider";
import { getSiteSettingsDefaults } from "@/lib/admin/site-settings-defaults";
import { listBackgroundImageUrls } from "@/lib/background-images";
import { getShikimoriEndpoints } from "@/lib/shikimori/endpoints";
import { PwaBottomNav } from "@/components/PwaBottomNav";
import { PwaProvider } from "@/components/PwaProvider";
import { InAppNotificationsListener } from "@/components/InAppNotificationsListener";
import { RecentAnimeOpensSync } from "@/components/anime/RecentAnimeOpensSync";
import { NotificationUiLayer } from "@/components/NotificationUiLayer";
import { TvNavigationProvider } from "@/components/TvNavigationProvider";
import { PWA_THEME_COLOR } from "@/app/manifest";
import { buildDefaultOpenGraph, defaultSiteDescription } from "@/lib/site-metadata";
import { SITE_LOGO_PATH, SITE_NAME, versionedAsset } from "@/lib/site-brand";
import { getSiteUrl } from "@/lib/site-url";
import { siteFontBodyClassName } from "@/lib/site-fonts";
import "./globals.css";
import "./translation-badges.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: defaultSiteDescription,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  formatDetection: {
    telephone: false,
  },
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
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: PWA_THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: "#f3f5fa" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await getShikimoriEndpoints();
  const [backgroundUrls, siteSettingsDefaults] = await Promise.all([
    Promise.resolve(listBackgroundImageUrls()),
    getSiteSettingsDefaults(),
  ]);

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
        <SiteSettingsInit defaults={siteSettingsDefaults} />
        <ThemeProvider>
          <PwaProvider>
            <AuthProvider>
              <RecentAnimeOpensSync />
              <InAppNotificationsListener />
              <NotificationUiLayer />
              <SiteSettingsProvider defaults={siteSettingsDefaults}>
                <UserListStatusProvider>
                  <SiteBackground urls={backgroundUrls} />
                  <NavigationProgressProvider>
                    <Suspense fallback={null}>
                      <ScrollRestoration />
                    </Suspense>
                    <TvNavigationProvider />
                    <Header />
                    <DiscordSitePresence />
                    <main className="relative z-10">{children}</main>
                    <SiteSettingsModal />
                    <PwaBottomNav />
                  </NavigationProgressProvider>
                </UserListStatusProvider>
              </SiteSettingsProvider>
            </AuthProvider>
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
