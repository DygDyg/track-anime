"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { BrandRotationSettingsDto } from "@/lib/admin/brand-rotation-settings";

type BrandSettingsResponse = {
  settings: BrandRotationSettingsDto;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  logoCount: number;
  logosDir: string;
  activeLogoSrc: string;
  activeLogoFileName: string | null;
  error?: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function BrandRotationSettingsPanel({
  initialSettings,
  minIntervalMinutes,
  maxIntervalMinutes,
  initialLogoCount,
  logosDir,
  initialActiveLogoSrc,
  initialActiveLogoFileName,
}: {
  initialSettings: BrandRotationSettingsDto;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  initialLogoCount: number;
  logosDir: string;
  initialActiveLogoSrc: string;
  initialActiveLogoFileName: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [intervalInput, setIntervalInput] = useState(String(initialSettings.intervalMinutes));
  const [logoCount, setLogoCount] = useState(initialLogoCount);
  const [activeLogoSrc, setActiveLogoSrc] = useState(initialActiveLogoSrc);
  const [activeLogoFileName, setActiveLogoFileName] = useState(initialActiveLogoFileName);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const applyResponse = useCallback((data: Partial<BrandSettingsResponse>) => {
    if (data.settings) {
      setSettings(data.settings);
      setEnabled(data.settings.enabled);
      setIntervalInput(String(data.settings.intervalMinutes));
    }
    if (typeof data.logoCount === "number") setLogoCount(data.logoCount);
    if (typeof data.activeLogoSrc === "string") setActiveLogoSrc(data.activeLogoSrc);
    if ("activeLogoFileName" in data) setActiveLogoFileName(data.activeLogoFileName ?? null);
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/brand-rotation/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as BrandSettingsResponse;
      applyResponse(data);
    } catch {
      /* ignore */
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    const intervalMinutes = Number.parseInt(intervalInput, 10);
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < minIntervalMinutes ||
      intervalMinutes > maxIntervalMinutes
    ) {
      setMessage({
        ok: false,
        text: `Укажите целое число от ${minIntervalMinutes} до ${maxIntervalMinutes} минут`,
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/brand-rotation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, intervalMinutes }),
      });
      const data = (await res.json()) as Partial<BrandSettingsResponse>;

      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      applyResponse(data);
      setMessage({ ok: true, text: "Настройки бренда сохранены" });
      void refresh();
    } catch {
      setMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  async function rotateNow() {
    setRotating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/brand-rotation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as Partial<BrandSettingsResponse>;

      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Не удалось сменить логотип" });
        return;
      }

      applyResponse(data);
      setMessage({ ok: true, text: "Логотип принудительно сменён" });
    } catch {
      setMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Ротация бренда</h2>
        <p className="mt-2 text-sm text-muted">
          Кладите WEBP-логотипы в папку ниже. Сайт выбирает один активный логотип на текущий
          временной слот и использует его в шапке, favicon, PWA manifest и уведомлениях.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
          <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-background">
            <Image
              src={activeLogoSrc}
              alt="Активный логотип"
              width={1536}
              height={1024}
              className="max-h-20 w-auto"
              unoptimized
            />
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className={adminClass.statLabel}>Папка</dt>
              <dd className="break-all font-mono text-foreground">{logosDir}</dd>
            </div>
            <div>
              <dt className={adminClass.statLabel}>WEBP-файлов</dt>
              <dd className="text-foreground">{logoCount}</dd>
            </div>
            <div>
              <dt className={adminClass.statLabel}>Активный файл</dt>
              <dd className="text-foreground">{activeLogoFileName ?? "public/logo.webp"}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEnabled((value) => !value)}
            className={enabled ? adminClass.btnSmOn : adminClass.btnSmOff}
          >
            {enabled ? "Ротация включена" : "Ротация выключена"}
          </button>
          <button type="button" onClick={() => void refresh()} className={adminClass.btnSecondary}>
            Обновить список
          </button>
          <button
            type="button"
            onClick={() => void rotateNow()}
            disabled={rotating || logoCount < 1}
            className={adminClass.btnSecondary}
            title={logoCount < 1 ? "Добавьте хотя бы один WEBP-логотип" : "Сменить активный логотип сейчас"}
          >
            {rotating ? "Смена…" : "Сменить сейчас"}
          </button>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">Интервал смены, минут</span>
          <input
            type="number"
            min={minIntervalMinutes}
            max={maxIntervalMinutes}
            step={1}
            value={intervalInput}
            onChange={(event) => setIntervalInput(event.target.value)}
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
          <span className="text-xs text-muted">
            Допустимо {minIntervalMinutes}–{maxIntervalMinutes}. По умолчанию 120 минут.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving} onClick={() => void save()} className={adminClass.btnPrimary}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {message ? (
            <p className={message.ok ? adminClass.alertSuccess : adminClass.alertError}>{message.text}</p>
          ) : null}
        </div>

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>
    </div>
  );
}
