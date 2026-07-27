"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalLoginForm } from "@/components/auth/LocalLoginForm";
import { QrLoginRequest } from "@/components/auth/QrLoginRequest";
import { AsyncButton } from "@/components/ui/AsyncButton";

const ERROR_MESSAGES: Record<string, string> = {
  config: "OAuth Shikimori не настроен. Добавьте ключи в .env.",
  redirect_https: "Shikimori не принимает HTTP для доменов. Добавьте в приложение Shikimori http://localhost:3000/api/auth/callback/shikimori (dev) и HTTPS callback текущего домена (прод).",
  missing_code: "Shikimori не вернул код авторизации.",
  invalid_state: "Сессия входа истекла или браузер заблокировал cookies. Отключите блокировку cookies для этого сайта и попробуйте снова.",
  oauth_failed: "Не удалось завершить вход. Проверьте Redirect URI и имя приложения на Shikimori.",
  invalid_scope: "Shikimori отклонил запрошенные права (scope). Проверьте SHIKIMORI_OAUTH_SCOPE на сервере.",
  friends_scope_missing: "Shikimori не выдал право «друзья» (friends). Повторите вход после настройки OAuth-приложения.",
  access_denied: "Вы отменили вход на Shikimori.",
};

export function AuthLoginPanel({
  errorCode,
  errorDetails,
  onLocalSuccess,
  showHomeLink = false,
  startShikimoriLogin,
  authNavigating,
}: {
  errorCode?: string | null;
  errorDetails?: string | null;
  onLocalSuccess?: () => void;
  showHomeLink?: boolean;
  startShikimoriLogin: () => void;
  authNavigating: boolean;
}) {
  const [oauthHint, setOauthHint] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [showOAuthDetails, setShowOAuthDetails] = useState(false);
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Не удалось войти. Попробуйте снова.") : null;

  useEffect(() => {
    void fetch("/api/auth/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { loginHint?: string | null; redirectUri?: string } | null) => {
        if (!data) return;
        setOauthHint(data.loginHint ?? null);
        setRedirectUri(data.redirectUri ?? null);
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <div className="md:grid md:grid-cols-[minmax(16rem,1fr)_minmax(14rem,18rem)] md:items-start md:gap-6">
        <div className="min-w-0">
          <p className="mt-2 text-sm leading-relaxed text-muted">Выберите удобный способ. Shikimori останется привязанным к вашему аккаунту.</p>
          {errorMessage ? <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"><p>{errorMessage}</p>{errorDetails ? <p className="mt-2 break-all font-mono text-xs text-red-100/90">{errorDetails}</p> : null}</div> : null}
          {oauthHint && (showOAuthDetails || errorCode) ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"><p>{oauthHint}</p>{redirectUri ? <p className="mt-2 break-all font-mono text-xs text-amber-100/90">{redirectUri}</p> : null}</div> : null}
          <AsyncButton type="button" data-tv-autofocus onClick={() => { setShowOAuthDetails(true); startShikimoriLogin(); }} loading={authNavigating} loadingLabel="Переход на Shikimori…" className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-90">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/15 text-xs font-bold">S</span>
            <span className="text-center">Войти через Shikimori</span>
          </AsyncButton>
          <div id="local"><LocalLoginForm onSuccess={onLocalSuccess} /></div>
        </div>
        <div id="qr" className="min-w-0"><QrLoginRequest autoStart className="md:mt-0 md:border-l md:border-t-0 md:pl-6 md:pt-0" /></div>
      </div>
      {showHomeLink ? <p className="mt-4 text-center text-xs text-muted"><Link href="/" className="text-accent hover:underline">На главную</Link></p> : null}
    </>
  );
}
