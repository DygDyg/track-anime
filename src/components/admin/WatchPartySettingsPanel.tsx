"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { WatchPartyRoomsDto } from "@/lib/admin/watch-party-rooms";
import type { WatchPartySettingsDto } from "@/lib/admin/watch-party-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: WatchPartySettingsDto;
};

function formatWatchPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatRoomEpisode(state: { seasonNumber: number; episodeNumber: number }): string {
  return `S${state.seasonNumber} · E${state.episodeNumber}`;
}

export function WatchPartySettingsPanel({
  initialSettings,
}: {
  initialSettings: WatchPartySettingsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [roomsData, setRoomsData] = useState<WatchPartyRoomsDto>({
    rooms: [],
    unavailable: false,
    error: null,
  });
  const [roomsLoading, setRoomsLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/watch-party/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await fetch("/api/admin/watch-party/rooms", { cache: "no-store" });
      if (!res.ok) {
        setRoomsData({
          rooms: [],
          unavailable: true,
          error: `HTTP ${res.status}`,
        });
        return;
      }
      const data = (await res.json()) as WatchPartyRoomsDto;
      setRoomsData(data);
    } catch {
      setRoomsData({
        rooms: [],
        unavailable: true,
        error: "Ошибка сети",
      });
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
    const intervalId = window.setInterval(() => {
      void refreshRooms();
    }, 5_000);
    return () => window.clearInterval(intervalId);
  }, [refreshRooms]);

  async function save(patch: Partial<Pick<WatchPartySettingsDto, "enabled" | "allowGuests">>) {
    setSaving(true);
    setSaveMessage(null);

    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);

    try {
      const res = await fetch("/api/admin/watch-party/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { settings?: WatchPartySettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        setSettings(settings);
        return;
      }

      if (data.settings) setSettings(data.settings);
      setSaveMessage({ ok: true, text: "Настройки совместного просмотра сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Совместный просмотр</h2>
        <p className="mt-2 text-sm text-muted">
          Глобальные настройки WebSocket-комнат TA-плеера. Комнаты хранятся в памяти
          отдельного процесса и исчезают при его перезапуске.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={saving}
            onChange={(event) => void save({ enabled: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">Включить совместный просмотр</span>
            <span className="mt-1 block text-xs text-muted">
              Если выключено, кнопка создания комнаты и авто-вход по invite-ссылке скрыты.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.allowGuests}
            disabled={saving || !settings.enabled}
            onChange={(event) => void save({ allowGuests: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">
              Разрешить вход незарегистрированным пользователям
            </span>
            <span className="mt-1 block text-xs text-muted">
              Гости получают локальное случайное имя вида «Гость 1234».
            </span>
          </span>
        </label>

        {saveMessage ? (
          <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>
            {saveMessage.text}
          </p>
        ) : null}

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Активные комнаты</h3>
            <p className="mt-1 text-xs text-muted">
              Список читается из памяти WebSocket-сервера и обновляется автоматически.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRooms()}
            disabled={roomsLoading}
            className={adminClass.btnSecondary}
          >
            {roomsLoading ? "Обновление…" : "Обновить"}
          </button>
        </div>

        {roomsData.unavailable ? (
          <p className={adminClass.alertError}>
            WebSocket-сервер комнат недоступен
            {roomsData.error ? `: ${roomsData.error}` : ""}.
          </p>
        ) : null}

        {!roomsData.unavailable && roomsData.rooms.length === 0 ? (
          <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted">
            Активных комнат сейчас нет.
          </p>
        ) : null}

        <div className="space-y-3">
          {roomsData.rooms.map((room) => (
            <article
              key={room.id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Комната {room.id} · {room.animeTitle ?? `Shikimori ${room.state.shikimoriId}`}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatRoomEpisode(room.state)} · {room.translationTitle ?? room.state.kodikId} ·{" "}
                    {formatWatchPosition(room.state.positionSeconds)} ·{" "}
                    {room.state.isPlaying ? "воспроизведение" : "пауза"}
                  </p>
                </div>
                <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">
                  {room.participantCount} участн.
                </span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Пользователь</th>
                      <th className="py-2 pr-3 font-medium">Серия</th>
                      <th className="py-2 pr-3 font-medium">Озвучка</th>
                      <th className="py-2 pr-3 font-medium">Время</th>
                      <th className="py-2 pr-3 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.participants.map((participant) => (
                      <tr key={participant.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 text-foreground">
                          {participant.nickname}
                          {participant.isMaster ? (
                            <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                              мастер
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {participant.state ? formatRoomEpisode(participant.state) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {participant.translationTitle ?? participant.state?.kodikId ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {participant.state
                            ? formatWatchPosition(participant.state.positionSeconds)
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {participant.state
                            ? participant.state.isPlaying
                              ? "play"
                              : "pause"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
