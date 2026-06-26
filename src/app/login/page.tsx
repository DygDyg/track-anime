"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const ERROR_MESSAGES: Record<string, string> = {
  config: "OAuth Shikimori не настроен. Добавьте ключи в .env.",
  redirect_https:
    "Shikimori не принимает HTTP для доменов. Добавьте в приложение Shikimori только http://localhost:3000/api/auth/callback/shikimori или HTTPS-адрес (например https://ta.dygdyg.ru/api/auth/callback/shikimori).",
  missing_code: "Shikimori не вернул код авторизации.",
  invalid_state:
    "Сессия входа истекла или браузер заблокировал cookies. Отключите блокировку для ta.dygdyg.ru и попробуйте снова.",
  oauth_failed: "Не удалось завершить вход. Проверьте Redirect URI и имя приложения на Shikimori.",
  access_denied: "Вы отменили вход на Shikimori.",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();
  const [oauthHint, setOauthHint] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  const errorCode = searchParams.get("error");
  const errorDetails = searchParams.get("details");
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? "Не удалось войти. Попробуйте снова.")
    : null;

  useEffect(() => {
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { loginHint?: string | null; redirectUri?: string } | null) => {
        if (!data) return;
        setOauthHint(data.loginHint ?? null);
        setRedirectUri(data.redirectUri ?? null);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">
        Загрузка…
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">
        Перенаправление…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/50">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Вход через Shikimori</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Вы будете перенаправлены на shikimori.io. Если у вас уже есть аккаунт — нажмите{" "}
          <strong className="font-medium text-foreground">«Войти»</strong>, а не «Зарегистрироваться».
        </p>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <p>{errorMessage}</p>
            {errorDetails ? (
              <p className="mt-2 break-all font-mono text-xs text-red-100/90">{errorDetails}</p>
            ) : null}
          </div>
        ) : null}

        {oauthHint ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <p>{oauthHint}</p>
            {redirectUri ? (
              <p className="mt-2 break-all font-mono text-xs text-amber-100/90">{redirectUri}</p>
            ) : null}
          </div>
        ) : null}

        {errorCode === "invalid_state" || errorCode === "oauth_failed" ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Если Shikimori показывает «Ты уже в системе» — вы уже авторизованы там. Нажмите кнопку ниже
            ещё раз: должно открыться окно разрешения приложения Track Anime.
          </p>
        ) : null}

        <button
          type="button"
          onClick={login}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent/90"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-white/15 text-xs font-bold">
            S
          </span>
          Войти через Shikimori
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/" className="text-accent hover:underline">
            На главную
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">
          Загрузка…
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
