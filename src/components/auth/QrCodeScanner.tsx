"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function codeFromQrValue(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.pathname !== "/login/qr") return null;
    return url.searchParams.get("code");
  } catch {
    return null;
  }
}

export function QrCodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: number | null = null;
    let active = true;
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) {
      setError("Этот браузер не поддерживает сканирование QR. Откройте код камерой телефона.");
      return;
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new DetectorClass({ formats: ["qr_code"] });
        interval = window.setInterval(() => {
          if (!videoRef.current) return;
          void detector.detect(videoRef.current).then((codes) => {
            const code = codes[0]?.rawValue ? codeFromQrValue(codes[0].rawValue) : null;
            if (code) onDetected(code);
          }).catch(() => undefined);
        }, 350);
      } catch {
        setError("Не удалось открыть камеру. Разрешите доступ к камере и попробуйте снова.");
      }
    })();

    return () => {
      active = false;
      if (interval !== null) window.clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Сканировать QR-код">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/70">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Сканировать QR-код</h2><p className="mt-1 text-sm text-muted">Наведите камеру на QR-код входа.</p></div><button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground" aria-label="Закрыть">×</button></div>
        {error ? <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{error}</p> : <video ref={videoRef} muted playsInline className="mt-5 aspect-square w-full rounded-xl bg-black object-cover" />}
      </div>
    </div>
  );
}
