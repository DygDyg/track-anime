"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export function LocalLoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { refresh } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Не удалось войти.");
        return;
      }
      const authenticatedUser = await refresh();
      if (!authenticatedUser) {
        setError("Вход принят, но браузер не сохранил сессию. Проверьте настройки cookies для этого адреса.");
        return;
      }
      onSuccess?.();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <label className="block text-sm text-muted">
        Логин
        <input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" required className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent" />
      </label>
      <label className="block text-sm text-muted">
        Пароль
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent" />
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button type="submit" disabled={submitting} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/50 disabled:opacity-60">
        {submitting ? "Входим…" : "Войти по логину и паролю"}
      </button>
    </form>
  );
}
