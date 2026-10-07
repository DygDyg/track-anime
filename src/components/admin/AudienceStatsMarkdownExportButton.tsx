"use client";

import { useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";

export function AudienceStatsMarkdownExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audience/markdown", { cache: "no-store" });
      if (!res.ok) {
        setError(`Не удалось скачать (HTTP ${res.status})`);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/i.exec(disposition);
      const filename = match?.[1] ?? "track-anime-audience.md";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void download()}
        disabled={loading}
        className={adminClass.btnSecondary}
      >
        {loading ? "Готовлю Markdown…" : "Скачать Markdown"}
      </button>
      {error ? <p className={`text-sm ${adminClass.alertError}`}>{error}</p> : null}
    </div>
  );
}
