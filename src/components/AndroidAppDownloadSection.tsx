"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { isTrackAnimeAndroidApp, TRACK_ANIME_ANDROID_SETTINGS_URL } from "@/lib/android-app";
import { isTrackAnimeWindowsApp, TRACK_ANIME_WINDOWS_SETTINGS_URL } from "@/lib/windows-app";

/** Min column width so QR (10rem) + text + padding fit without horizontal overflow. */
const APP_CARD_MIN_WIDTH = "22rem";

type AppDownloadCardProps = {
  title: string;
  description: string;
  qrSrc: string | null;
  qrAlt: string;
  hint: string;
  actionHref: string;
  actionLabel: string;
};

function AppDownloadCard({
  title,
  description,
  qrSrc,
  qrAlt,
  hint,
  actionHref,
  actionLabel,
}: AppDownloadCardProps) {
  return (
    <section className="@container/card flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div
        className={[
          "flex min-w-0 flex-1 flex-col items-center gap-4 rounded-xl border border-border",
          "bg-foreground/[0.03] p-4 text-center",
          "@[20rem]/card:flex-row @[20rem]/card:items-start @[20rem]/card:p-5 @[20rem]/card:text-left",
        ].join(" ")}
      >
        {qrSrc ? (
          <img
            src={qrSrc}
            alt={qrAlt}
            className="h-32 w-32 shrink-0 rounded-lg bg-white p-2 @[20rem]/card:h-40 @[20rem]/card:w-40"
          />
        ) : (
          <div
            className="h-32 w-32 shrink-0 animate-pulse rounded-lg bg-foreground/10 @[20rem]/card:h-40 @[20rem]/card:w-40"
            aria-label="Создаём QR-код"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">{hint}</p>
          <a
            href={actionHref}
            download
            className={[
              "inline-flex self-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white",
              "transition hover:bg-accent/90 @[20rem]/card:self-start",
            ].join(" ")}
          >
            {actionLabel}
          </a>
        </div>
      </div>
    </section>
  );
}

export function AndroidAppDownloadSection() {
  const [androidQrCode, setAndroidQrCode] = useState<string | null>(null);
  const [windowsQrCode, setWindowsQrCode] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [windowsVersion, setWindowsVersion] = useState<string | null>(null);
  const [androidNative, setAndroidNative] = useState(false);
  const [windowsNative, setWindowsNative] = useState(false);

  useEffect(() => {
    setAndroidNative(isTrackAnimeAndroidApp());
    setWindowsNative(isTrackAnimeWindowsApp());
  }, []);

  useEffect(() => {
    const pageUrl = new URL("/app", window.location.origin).href;
    const windowsDownloadUrl = new URL("/downloads/TrackAnimeWindows.exe", window.location.origin).href;
    void QRCode.toDataURL(pageUrl, { margin: 1, width: 256, errorCorrectionLevel: "M" })
      .then(setAndroidQrCode)
      .catch(() => setAndroidQrCode(null));
    void QRCode.toDataURL(windowsDownloadUrl, { margin: 1, width: 256, errorCorrectionLevel: "M" })
      .then(setWindowsQrCode)
      .catch(() => setWindowsQrCode(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/downloads/TrackAnime.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("manifest unavailable");
        const manifest: { versionName?: unknown } = await response.json();
        if (!cancelled && typeof manifest.versionName === "string") setAppVersion(manifest.versionName);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    void fetch("/downloads/TrackAnimeWindows.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("manifest unavailable");
        const manifest: { versionName?: unknown } = await response.json();
        if (!cancelled && typeof manifest.versionName === "string") setWindowsVersion(manifest.versionName);
      })
      .catch(() => {
        if (!cancelled) setWindowsVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nativeShell = androidNative || windowsNative;
  const settingsUrl = windowsNative ? TRACK_ANIME_WINDOWS_SETTINGS_URL : TRACK_ANIME_ANDROID_SETTINGS_URL;

  let settingsBlock: ReactNode = null;
  if (nativeShell) {
    settingsBlock = (
      <section className="rounded-xl border border-border bg-foreground/[0.03] p-4">
        <h2 className="text-lg font-semibold text-foreground">Настройки приложения</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          HTTP-прокси на случай недоступности зеркал, очистка кэша WebView
          {androidNative ? " и режим системных панелей Android" : ""}. Вход в аккаунт сохранится.
        </p>
        <a
          href={settingsUrl}
          className="mt-3 inline-flex rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:bg-accent/10"
        >
          Открыть настройки приложения
        </a>
      </section>
    );
  }

  return (
    <section className="@container/apps min-w-0 space-y-6">
      {settingsBlock}

      {/*
        auto-fit + minmax: second column only appears when the container can fit
        two cards at APP_CARD_MIN_WIDTH (modal sidebar content stays 1 column).
      */}
      <div
        className="grid min-w-0 gap-6"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${APP_CARD_MIN_WIDTH}), 1fr))`,
        }}
      >
        <AppDownloadCard
          title="Приложение для Android"
          description={`Установите Track Anime на телефон, планшет или Android TV. QR-код ведёт на эту страницу.${
            appVersion ? ` Текущая версия: ${appVersion}.` : ""
          }`}
          qrSrc={androidQrCode}
          qrAlt="QR-код страницы приложения Track Anime для Android"
          hint="Отсканируйте код камерой телефона или скачайте APK прямо на устройстве."
          actionHref="/downloads/TrackAnime.apk"
          actionLabel="Скачать APK"
        />
        <AppDownloadCard
          title="Приложение для Windows"
          description={`Установите Track Anime на компьютер с Windows. Настольная оболочка на WebView2: зеркала, HTTP-прокси, блокировка рекламы Kodik и проверка обновлений. Нужен Microsoft Edge WebView2 Runtime. QR-код ведёт на скачивание exe.${
            windowsVersion ? ` Текущая версия: ${windowsVersion}.` : ""
          }`}
          qrSrc={windowsQrCode}
          qrAlt="QR-код скачивания приложения Track Anime для Windows"
          hint="Отсканируйте код камерой телефона, чтобы открыть ссылку на скачивание, или скачайте exe прямо на компьютере. Портативный файл — распаковка не нужна."
          actionHref="/downloads/TrackAnimeWindows.exe"
          actionLabel="Скачать для Windows"
        />
      </div>
    </section>
  );
}
