"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatLocalLogin, sanitizeLocalLoginInput } from "@/lib/auth/local-login-name";
import { useAuth } from "@/components/auth/AuthProvider";

export function LocalCredentialSettings({ suggestedLogin, shikimoriId }: { suggestedLogin: string; shikimoriId: number }) {
  const { user, refresh } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [savedLogin, setSavedLogin] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alertStorageKey = `ta.local-credential-alert:${shikimoriId}`;

  useEffect(() => {
    void fetch("/api/auth/local-credentials", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { login?: string | null } | null) => {
        const existing = data?.login ?? null;
        setSavedLogin(existing);
        setLogin(existing ?? (formatLocalLogin(suggestedLogin) || `user_${shikimoriId}`));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [shikimoriId, suggestedLogin]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/local-credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = (await response.json().catch(() => null)) as { login?: string; error?: string } | null;
      if (!response.ok) {
        setMessage(data?.error ?? "Не удалось сохранить данные.");
        return;
      }
      const saved = data?.login ?? formatLocalLogin(login);
      setSavedLogin(saved);
      setLogin(saved);
      setPassword("");
      setMessage("Локальный способ входа сохранён.");
      await refresh();
    } catch {
      setMessage("Не удалось связаться с сервером.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLocalCredential() {
    if (!savedLogin || saving) return;
    if (!window.confirm("Удалить локальный логин и пароль? Вход через Shikimori останется доступен.")) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/local-credentials", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setSavedLogin(null);
      setPassword("");
      window.localStorage.removeItem(alertStorageKey);
      setMessage("Локальный вход удалён. Теперь показано состояние нового пользователя.");
      await refresh();
    } catch {
      setMessage("Не удалось удалить локальный вход.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`rounded-xl border px-4 py-4 ${loaded && !savedLogin ? "border-amber-400/50 bg-amber-500/10" : "border-border bg-background/40"}`}>
      <h2 className={`text-sm font-semibold uppercase tracking-wide ${loaded && !savedLogin ? "text-amber-200" : "text-muted"}`}>Локальный вход</h2>
      <p className="mt-1 text-sm text-muted">{savedLogin ? `Логин «${savedLogin}» уже настроен. Новый пароль заменит текущий.` : "Важно: создайте логин и пароль, чтобы иметь запасной способ входа без Shikimori."}</p>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">Логин<input value={login} onChange={(event) => setLogin(sanitizeLocalLoginInput(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-accent" required /></label>
        <label className="text-sm text-muted">{savedLogin ? "Новый пароль" : "Пароль"}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-accent" required /></label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Сохраняем…" : savedLogin ? "Изменить логин или пароль" : "Создать логин и пароль"}</button>{savedLogin && user?.isAdmin ? <button type="button" onClick={() => void removeLocalCredential()} disabled={saving} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-60">Удалить локальный вход (отладка)</button> : null}</div>
        {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}
      </form>
    </section>
  );
}
