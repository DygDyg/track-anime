"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { SHIKIMORI_RELOGIN_MESSAGE } from "@/lib/shikimori/auth-messages";

/** Экран списков, когда нет локального кэша и токен Shikimori мёртв. */
export function ShikimoriReconnectRequired() {
  const { reconnectShikimori, authNavigating, notifyShikimoriAuthExpired } = useAuth();

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">{SHIKIMORI_RELOGIN_MESSAGE}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Вход на Track Anime сохранён, но для списков и синхронизации нужно снова подтвердить доступ
        Shikimori.
      </p>
      <button
        type="button"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        disabled={authNavigating}
        onClick={() => {
          notifyShikimoriAuthExpired();
          reconnectShikimori();
        }}
      >
        {authNavigating ? "Переход…" : "Переподключить Shikimori"}
      </button>
    </div>
  );
}
