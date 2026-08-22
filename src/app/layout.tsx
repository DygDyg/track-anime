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
import { getShikimoriEndpoints } from "@/lib/shikimori/endpoints";
import { PwaBottomNav } from "@/components/PwaBottomNav";
import { PwaProvider } from "@/components/PwaProvider";
import { InAppNotificationsListener } from "@/components/InAppNotificationsListener";
import { TodayFromHistoryToastListener } from "@/components/TodayFromHistoryToastListener";
import { RecentAnimeOpensSync } from "@/components/anime/RecentAnimeOpensSync";
import { NotificationUiLayer } from "@/components/NotificationUiLayer";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { AquaCoderCompanion } from "@/components/companion/AquaCoderCompanion";
import { PullToRefresh } from "@/components/PullToRefresh";
import { TvNavigationProvider } from "@/components/TvNavigationProvider";
import { PWA_THEME_COLOR } from "@/app/manifest";
import { buildDefaultOpenGraph, defaultSiteDescription } from "@/lib/site-metadata";
import { SITE_LOGO_PATH, SITE_NAME, versionedAsset } from "@/lib/site-brand";
import { getSiteUrl } from "@/lib/site-url";
import { siteFontBodyClassName } from "@/lib/site-fonts";
import { getActiveBrandAsset } from "@/lib/brand-rotation";
import { getSiteBuildFingerprint } from "@/lib/admin/build-info";
import { ClientUpdateGuard } from "@/components/ClientUpdateGuard";
import "./globals.css";
import "./translation-badges.css";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getActiveBrandAsset();
  const logoUrl = brand.file ? `/api/brand/logo?v=${brand.cacheKey}` : versionedAsset(SITE_LOGO_PATH);
  const faviconUrl = brand.file ? `/api/brand/favicon?v=${brand.cacheKey}` : versionedAsset("/favicon.ico");
  const icon32Url = brand.file
    ? `/api/brand/icon?size=32&v=${brand.cacheKey}`
    : versionedAsset("/favicon-32.png");
  const icon16Url = brand.file
    ? `/api/brand/icon?size=16&v=${brand.cacheKey}`
    : versionedAsset("/favicon-16.png");
  const appleIconUrl = brand.file
    ? `/api/brand/icon?size=180&v=${brand.cacheKey}`
    : versionedAsset("/apple-touch-icon.png");

  return {
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
    openGraph: buildDefaultOpenGraph(logoUrl),
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: defaultSiteDescription,
      images: [logoUrl],
    },
    icons: {
      icon: [
        { url: logoUrl, type: "image/webp" },
        { url: faviconUrl, type: "image/x-icon" },
        { url: icon32Url, sizes: "32x32", type: "image/png" },
        { url: icon16Url, sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: appleIconUrl, sizes: "180x180", type: "image/png" }],
      shortcut: [faviconUrl],
    },
  };
}

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
  const [siteSettingsDefaults, buildFingerprint] = await Promise.all([
    getSiteSettingsDefaults(),
    Promise.resolve(getSiteBuildFingerprint()),
  ]);
  const brand = await getActiveBrandAsset();

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
            <ClientUpdateGuard initialFingerprint={buildFingerprint} />
            <AuthProvider>
              <RecentAnimeOpensSync />
              <InAppNotificationsListener />
              <TodayFromHistoryToastListener />
              <SiteSettingsProvider defaults={siteSettingsDefaults}>
                <NotificationUiLayer />
                <UserListStatusProvider>
                  <SiteBackground />
                  <NavigationProgressProvider>
                    <Suspense fallback={null}>
                      <ScrollRestoration />
                    </Suspense>
                    <TvNavigationProvider />
                    <Header logoSrc={brand.logoSrc} />
                    <DiscordSitePresence />
                    <main className="relative z-10">{children}</main>
                    <PullToRefresh />
                    <ScrollToTopButton />
                    <AquaCoderCompanion />
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
