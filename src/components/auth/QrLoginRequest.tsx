"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RequestData = { code: string; requesterSecret: string; expiresAt: string };

export function QrLoginRequest({ autoStart = false }: { autoStart?: boolean }) {
  const router = useRouter();
  const [request, setRequest] = useState<RequestData | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function create() {
    if (creating) return;
    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/qr/request", { method: "POST" });
      if (!response.ok) throw new Error();
      const next = (await response.json()) as RequestData;
      const url = `${window.location.origin}/login/qr?code=${encodeURIComponent(next.code)}`;
      setImage(await QRCode.toDataURL(url, { margin: 1, width: 256, errorCorrectionLevel: "M" }));
      setRequest(next);
    } catch {
      setMessage("Не удалось создать QR-код. Попробуйте ещё раз.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (autoStart) void create();
    // QR-код создаётся один раз при открытии окна; повторный запрос только по кнопке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (!request) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const params = new URLSearchParams({ code: request.code, secret: request.requesterSecret });
        const response = await fetch(`/api/auth/qr/status?${params}`, { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { status?: string } | null;
        if (!response.ok || !data?.status) return;
        if (data.status === "approved") {
          const claim = await fetch("/api/auth/qr/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
          if (claim.ok) router.replace("/");
          return;
        }
        if (data.status === "expired" || data.status === "rejected" || data.status === "consumed") {
          setMessage(data.status === "rejected" ? "Вход отклонён на подтверждающем устройстве." : "Срок действия QR-кода истёк. Создайте новый.");
          setRequest(null);
          setImage(null);
        }
      })();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [request, router]);

  return (
    <section className="mt-6 border-t border-border pt-5 text-center">
      <h2 className="text-sm font-semibold text-foreground">Вход по QR-коду</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">Покажите код на этом устройстве и отсканируйте его устройством, на котором войдёте или уже вошли.</p>
      {image ? <img src={image} alt="QR-код для входа" className="mx-auto mt-4 h-48 w-48 rounded-lg bg-white p-2" /> : null}
      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
      <button type="button" onClick={create} disabled={creating} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/50 disabled:opacity-60">
        {creating ? "Создаём…" : image ? "Создать новый QR-код" : "Показать QR-код"}
      </button>
    </section>
  );
}
