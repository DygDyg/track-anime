"use client";

import jsQR from "jsqr";
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

function getBarcodeDetector(): DetectorConstructor | null {
  return (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector ?? null;
}

export function QrCodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let active = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const reportCode = (rawValue: string | undefined) => {
      if (!rawValue || detectedRef.current) return;
      const code = codeFromQrValue(rawValue);
      if (!code) return;
      detectedRef.current = true;
      onDetected(code);
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Этот браузер не даёт доступ к камере. Откройте код камерой телефона.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          if (active) setError("Не удалось открыть камеру. Разрешите доступ к камере и попробуйте снова.");
          return;
        }
      }

      if (!active || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const DetectorClass = getBarcodeDetector();
      if (DetectorClass) {
        const detector = new DetectorClass({ formats: ["qr_code"] });
        const tickNative = () => {
          if (!active || !videoRef.current) return;
          void detector
            .detect(videoRef.current)
            .then((codes) => reportCode(codes[0]?.rawValue))
            .catch(() => undefined)
            .finally(() => {
              if (active) raf = window.setTimeout(tickNative, 350);
            });
        };
        tickNative();
        return;
      }

      if (!ctx) {
        setError("Не удалось инициализировать сканер QR.");
        return;
      }

      const tickJs = () => {
        if (!active || !videoRef.current) return;
        const el = videoRef.current;
        if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0) {
          const w = el.videoWidth;
          const h = el.videoHeight;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          ctx.drawImage(el, 0, 0, w, h);
          const image = ctx.getImageData(0, 0, w, h);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
          if (result?.data) reportCode(result.data);
        }
        if (active) raf = window.requestAnimationFrame(tickJs);
      };
      raf = window.requestAnimationFrame(tickJs);
    })();

    return () => {
      active = false;
      window.clearTimeout(raf);
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Сканировать QR-код">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Сканировать QR-код</h2>
            <p className="mt-1 text-sm text-muted">Наведите камеру на QR-код входа.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground" aria-label="Закрыть">
            ×
          </button>
        </div>
        {error ? (
          <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{error}</p>
        ) : (
          <video ref={videoRef} muted playsInline className="mt-5 aspect-square w-full rounded-xl bg-black object-cover" />
        )}
      </div>
    </div>
  );
}
