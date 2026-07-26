"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocalLoginForm } from "@/components/auth/LocalLoginForm";
import { useAuth } from "@/components/auth/AuthProvider";

type QrLoginApprovalDialogProps = {
  code: string;
  modal?: boolean;
  onClose?: () => void;
};

export function QrLoginApprovalDialog({ code, modal = true, onClose }: QrLoginApprovalDialogProps) {
  const { user, loading } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const returnTo = `/login/qr?code=${encodeURIComponent(code)}`;

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  async function decide(decision: "approve" | "reject") {
    if (!code || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/qr/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, decision }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
      const accepted = response.ok && data?.status === (decision === "approve" ? "approved" : "rejected");
      if (!accepted) {
        setMessage(data?.error ?? "QR-код больше не действует.");
        return;
      }
      setCompleted(true);
      setMessage(decision === "approve" ? "Вход на новом устройстве подтверждён." : "Вход отклонён.");
      if (onClose) closeTimerRef.current = window.setTimeout(onClose, 900);
    } catch {
      setMessage("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!code) return <p className="text-sm text-muted">QR-код некорректен.</p>;

  const card = (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Подтвердить вход</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Разрешите вход на устройстве, где был показан этот QR-код.</p>
        </div>
        {onClose ? <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground" aria-label="Закрыть">×</button> : null}
      </div>
      {loading ? <p className="mt-5 text-sm text-muted">Проверяем вход…</p> : null}
      {!loading && !user ? (
        <>
          <p className="mt-5 text-sm text-muted">Сначала войдите на этом устройстве.</p>
          <LocalLoginForm />
          <a href={`/api/auth/shikimori?returnTo=${encodeURIComponent(returnTo)}`} className="mt-3 block text-center text-sm font-semibold text-accent hover:underline">Войти через Shikimori</a>
        </>
      ) : null}
      {!loading && user ? (
        <div className="mt-5">
          <p className="text-sm text-muted">Вы вошли как <span className="font-semibold text-foreground">{user.nickname}</span>.</p>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => void decide("approve")} disabled={submitting || completed} className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Разрешить</button>
            <button type="button" onClick={() => void decide("reject")} disabled={submitting || completed} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60">Отклонить</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
      {!modal ? <p className="mt-5 text-center text-xs text-muted"><Link href="/" className="text-accent hover:underline">На главную</Link></p> : null}
    </div>
  );

  if (!modal) return <main className="flex min-h-screen items-center justify-center bg-background px-4">{card}</main>;

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Подтвердить вход">{card}</div>;
}
