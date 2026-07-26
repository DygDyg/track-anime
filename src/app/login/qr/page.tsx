"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LocalLoginForm } from "@/components/auth/LocalLoginForm";
import { useAuth } from "@/components/auth/AuthProvider";

function QrApprovalPageInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const { user, loading } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const returnTo = `/login/qr?code=${encodeURIComponent(code)}`;

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
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(response.ok ? (decision === "approve" ? "Вход на новом устройстве подтверждён." : "Вход отклонён.") : (data?.error ?? "QR-код больше не действует."));
    } catch {
      setMessage("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!code) {
    return <main className="mx-auto flex min-h-screen max-w-md items-center px-4 text-center text-muted">QR-код некорректен.</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/50">
        <h1 className="text-lg font-semibold text-foreground">Подтвердить вход</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Разрешите вход на устройстве, где был показан этот QR-код.</p>
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
              <button type="button" onClick={() => void decide("approve")} disabled={submitting} className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Разрешить</button>
              <button type="button" onClick={() => void decide("reject")} disabled={submitting} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60">Отклонить</button>
            </div>
          </div>
        ) : null}
        {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
        <p className="mt-5 text-center text-xs text-muted"><Link href="/" className="text-accent hover:underline">На главную</Link></p>
      </div>
    </main>
  );
}

export default function QrApprovalPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center px-4 text-center text-muted">Загрузка…</main>}>
      <QrApprovalPageInner />
    </Suspense>
  );
}
