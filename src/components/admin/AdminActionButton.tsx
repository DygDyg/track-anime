"use client";

import { useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";

type ActionResult = {
  ok: boolean;
  message: string;
};

export function AdminActionButton({
  label,
  endpoint,
  method = "POST",
  confirmText,
  idleHint,
  variant = "primary",
}: {
  label: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  confirmText?: string;
  idleHint?: string;
  variant?: "primary" | "secondary";
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;

    setLoading(true);
    setResult(null);
    window.dispatchEvent(new Event("ta-admin-import-start"));

    try {
      const res = await fetch(endpoint, { method });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? "Ошибка запроса" });
        return;
      }
      setResult({ ok: true, message: data.message ?? "Готово" });
    } catch {
      setResult({ ok: false, message: "Не удалось выполнить запрос" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={adminClass.panel}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className={variant === "primary" ? adminClass.btnPrimary : adminClass.btnSecondary}
      >
        {loading ? "Выполняется…" : label}
      </button>
      {idleHint ? <p className="mt-3 text-sm leading-relaxed text-muted">{idleHint}</p> : null}
      {result ? (
        <p className={`mt-3 ${result.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
