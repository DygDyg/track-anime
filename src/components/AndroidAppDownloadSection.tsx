"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function AndroidAppDownloadSection() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const pageUrl = new URL("/app", window.location.origin).href;
    void QRCode.toDataURL(pageUrl, { margin: 1, width: 256, errorCorrectionLevel: "M" })
      .then(setQrCode)
      .catch(() => setQrCode(null));
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
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Приложение для Android</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Установите Track Anime на телефон, планшет или Android TV. QR-код ведёт на эту страницу.
          {appVersion ? ` Текущая версия: ${appVersion}.` : ""}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-foreground/[0.03] p-5 text-center sm:flex-row sm:text-left">
        {qrCode ? (
          <img src={qrCode} alt="QR-код страницы приложения Track Anime" className="h-40 w-40 rounded-lg bg-white p-2" />
        ) : (
          <div className="h-40 w-40 animate-pulse rounded-lg bg-foreground/10" aria-label="Создаём QR-код" />
        )}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            Отсканируйте код камерой телефона или скачайте APK прямо на устройстве.
          </p>
          <a
            href="/downloads/TrackAnime.apk"
            download
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Скачать APK
          </a>
        </div>
      </div>
    </section>
  );
}
