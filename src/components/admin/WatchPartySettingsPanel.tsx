"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { WatchPartySettingsDto } from "@/lib/admin/watch-party-settings";
import type {
  WatchPartyRoomPlaybackStateDto,
  WatchPartyRoomsDto,
} from "@/lib/admin/watch-party-rooms";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: WatchPartySettingsDto;
};

type RoomsResponse = {
  rooms: WatchPartyRoomsDto;
};

function formatPosition(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatWatchState(state?: WatchPartyRoomPlaybackStateDto): string {
  if (!state) return "Нет данных";
  const title = state.title ?? `Shikimori ${state.shikimoriId}`;
  const translation = state.translationTitle ? ` · ${state.translationTitle}` : "";
  const playback = state.isPlaying ? "играет" : "пауза";
  return `${title}${translation} · S${state.seasonNumber} E${state.episodeNumber} · ${formatPosition(
    state.positionSeconds,
  )} · ${playback}`;
}

export function WatchPartySettingsPanel({
  initialSettings,
  initialRooms,
}: {
  initialSettings: WatchPartySettingsDto;
  initialRooms: WatchPartyRoomsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [rooms, setRooms] = useState(initialRooms);
  const [saving, setSaving] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshSettings = useCallback(async () => {
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
      if (!res.ok) return;
      const data = (await res.json()) as RoomsResponse;
      setRooms(data.rooms);
    } catch {
      setRooms((current) => ({
        ...current,
        error: "Ошибка сети при получении комнат",
      }));
    } finally {
      setRoomsLoading(false);
    }
  }, []);

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
      void refreshSettings();
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
          Глобальные настройки WebSocket-комнат beta-плеера. Комнаты хранятся в памяти
          отдельного процесса и исчезают при его перезапуске.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Активные комнаты</h3>
            <p className="mt-1 text-xs text-muted">
              Снимок из WebSocket-процесса: участники, мастер и текущая серия.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRooms()}
            disabled={roomsLoading}
            className={adminClass.btnSecondary}
          >
            {roomsLoading ? "Обновление..." : "Обновить"}
          </button>
        </div>

        {rooms.error ? (
          <p className={adminClass.alertError}>WebSocket-сервер комнат: {rooms.error}</p>
        ) : null}

        <p className="text-xs text-muted">
          Комнат: {rooms.rooms.length}. Снимок: {formatDateTime(rooms.generatedAt)}
        </p>

        {rooms.rooms.length === 0 ? (
          <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted">
            Активных комнат нет.
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.rooms.map((room) => (
              <div key={room.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-foreground">#{room.id}</p>
                    <p className="mt-1 text-xs text-muted">
                      Создана: {formatDateTime(room.createdAt)} · Участников:{" "}
                      {room.participants.length}
                    </p>
                  </div>
                  <span className={room.state.isPlaying ? adminClass.badgeRunning : adminClass.badgeIdle}>
                    {room.state.isPlaying ? "Играет" : "Пауза"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-foreground">{formatWatchState(room.state)}</p>

                <ul className="mt-3 space-y-2">
                  {room.participants.map((participant) => (
                    <li
                      key={participant.id}
                      className="rounded-md border border-border bg-card px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{participant.nickname}</span>
                        {participant.isMaster ? (
                          <span className={adminClass.badgeDone}>Мастер</span>
                        ) : null}
                        <span className="font-mono text-muted">{participant.userId}</span>
                      </div>
                      <p className="mt-1 text-muted">{formatWatchState(participant.state)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}
