"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DevicePresenceDto } from "@/lib/device-presence";
import {
  clientKindLabel,
  fetchUserDevices,
  getOrCreateDeviceKey,
  renameThisDevice,
} from "@/lib/device-presence-client";

function formatOpenedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DevicePresenceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [devices, setDevices] = useState<DevicePresenceDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchUserDevices();
      setDevices(list);
      const current = list.find((d) => d.isCurrent) ?? list.find((d) => d.deviceKey === getOrCreateDeviceKey());
      if (current) setNameInput(current.displayName);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  async function saveName() {
    setSavingName(true);
    setNameMessage(null);
    try {
      const device = await renameThisDevice(nameInput);
      if (!device) {
        setNameMessage("Не удалось сохранить. Откройте любую страницу и попробуйте снова.");
        return;
      }
      setNameMessage("Имя сохранено");
      setNameInput(device.displayName);
      void refresh();
    } catch {
      setNameMessage("Ошибка сети");
    } finally {
      setSavingName(false);
    }
  }

  function openDevice(device: DevicePresenceDto) {
    onClose();
    if (device.isCurrent) return;
    router.push(device.lastPath);
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Закрыть устройства"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-presence-title"
        className="relative flex max-h-[min(86dvh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/40 sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="device-presence-title" className="text-lg font-semibold text-foreground">
              Устройства
            </h2>
            <p className="mt-1 text-sm text-muted">
              Последние вкладки на ваших устройствах. Можно открыть вкладку с другого устройства.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted transition hover:bg-foreground/5 hover:text-foreground"
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <section className="space-y-2 rounded-xl border border-border/80 bg-foreground/[0.03] p-3">
            <label className="block text-sm font-medium text-foreground" htmlFor="device-display-name">
              Имя этого устройства
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="device-display-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={80}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                placeholder="Например, Домашний ПК"
              />
              <button
                type="button"
                disabled={savingName || !nameInput.trim()}
                onClick={() => void saveName()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingName ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
            {nameMessage ? <p className="text-xs text-muted">{nameMessage}</p> : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Список устройств</h3>
            {loading ? (
              <p className="text-sm text-muted">Загрузка…</p>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted">
                Пока нет устройств. Откройте несколько страниц на этом или другом клиенте под тем же
                аккаунтом.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-border/80">
                {devices.map((device) => (
                  <li key={device.id}>
                    <button
                      type="button"
                      onClick={() => openDevice(device)}
                      className="flex w-full flex-col gap-0.5 px-3 py-3 text-left transition hover:bg-foreground/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">
                          {device.displayName}
                          {device.isCurrent ? (
                            <span className="ml-2 text-xs font-normal text-accent">это устройство</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {clientKindLabel(device.clientKind)}
                        </span>
                      </div>
                      <span className="truncate text-sm text-muted">
                        {device.lastTitle || device.lastPath}
                      </span>
                      <span className="text-xs text-muted/80">{formatOpenedAt(device.lastOpenedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
