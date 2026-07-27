"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLoginPanel } from "@/components/auth/AuthLoginPanel";
import { useAuth } from "@/components/auth/AuthProvider";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, startShikimoriLogin, authNavigating } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, router, user]);

  if (loading || user) return <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">{loading ? "Загрузка…" : "Перенаправление…"}</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/50">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Вход</h1>
        <AuthLoginPanel
          errorCode={searchParams.get("error")}
          errorDetails={searchParams.get("details")}
          onLocalSuccess={() => window.location.reload()}
          showHomeLink
          startShikimoriLogin={startShikimoriLogin}
          authNavigating={authNavigating}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">Загрузка…</div>}><LoginPageInner /></Suspense>;
}
