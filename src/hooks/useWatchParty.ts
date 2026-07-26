"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WATCH_PARTY_PROTOCOL_VERSION } from "@/lib/watch-party/types";
import type {
  WatchPartyClientMessage,
  WatchPartyCommand,
  WatchPartyParticipant,
  WatchPartyPlaybackState,
  WatchPartyRoomPermissions,
  WatchPartyServerMessage,
} from "@/lib/watch-party/types";

type WatchPartyUser = {
  id: string;
  nickname: string;
  avatar: string | null;
};

type UseWatchPartyOptions = {
  user: WatchPartyUser | null;
  shikimoriId: number;
  getPlaybackState: () => WatchPartyPlaybackState | null;
  onCommand: (command: WatchPartyCommand) => void;
};

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
const GUEST_STORAGE_KEY = "ta.watchPartyGuest";

type WatchPartyRuntimeSettings = {
  enabled: boolean;
  allowGuests: boolean;
};

type WatchPartyGuest = {
  id: string;
  nickname: string;
};

function createGuestIdentity(): WatchPartyGuest {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: `guest:${randomPart}`,
    nickname: `Гость ${suffix}`,
  };
}

function readGuestIdentity(): WatchPartyGuest {
  if (typeof window === "undefined") return createGuestIdentity();

  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WatchPartyGuest>;
      if (typeof parsed.id === "string" && typeof parsed.nickname === "string") {
        return {
          id: parsed.id,
          nickname: parsed.nickname,
        };
      }
    }
  } catch {
    /* localStorage can be blocked; fall back to a per-page guest. */
  }

  const guest = createGuestIdentity();
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guest));
  } catch {
    /* ignore */
  }
  return guest;
}

function buildWatchPartyWsUrl(): string | null {
  if (typeof window === "undefined") return null;
  const configured = process.env.NEXT_PUBLIC_WATCH_PARTY_WS_URL;
  if (configured) return configured;

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/watch-party-ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseWatchRoomFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("watchRoom");
}

function clearWatchRoomFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("watchRoom")) return;
  url.searchParams.delete("watchRoom");
  window.history.replaceState(window.history.state, "", url.toString());
}

function setWatchRoomInLocation(roomId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("watchRoom") === roomId && url.hash === "#player") return;
  url.searchParams.set("watchRoom", roomId);
  url.hash = "player";
  window.history.replaceState(window.history.state, "", url.toString());
}

function buildInviteUrl(roomId: string | null): string {
  if (typeof window === "undefined" || !roomId) return "";
  const url = new URL(window.location.href);
  url.searchParams.set("watchRoom", roomId);
  url.hash = "player";
  return url.toString();
}

function buildRoomRedirectUrl(shikimoriId: number, roomId: string): string {
  const url = new URL(`/anime/${shikimoriId}`, window.location.origin);
  url.searchParams.set("watchRoom", roomId);
  url.hash = "player";
  return url.toString();
}

function isServerMessage(value: unknown): value is WatchPartyServerMessage {
  return value != null && typeof value === "object" && "type" in value;
}

export function useWatchParty({
  user,
  shikimoriId,
  getPlaybackState,
  onCommand,
}: UseWatchPartyOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [masterParticipantId, setMasterParticipantId] = useState<string | null>(null);
  const [allowParticipantControls, setAllowParticipantControlsState] = useState(false);
  const [allowParticipantSeeking, setAllowParticipantSeekingState] = useState(false);
  const [allowParticipantEpisodeSelection, setAllowParticipantEpisodeSelectionState] =
    useState(false);
  const [allowParticipantTranslationSelection, setAllowParticipantTranslationSelectionState] =
    useState(false);
  const [syncTranslations, setSyncTranslationsState] = useState(true);
  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([]);
  const [settings, setSettings] = useState<WatchPartyRuntimeSettings>({
    enabled: true,
    allowGuests: true,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [urlRoomId, setUrlRoomId] = useState(() => parseWatchRoomFromLocation());
  const [guest] = useState(readGuestIdentity);
  const wsRef = useRef<WebSocket | null>(null);
  const onCommandRef = useRef(onCommand);
  const getPlaybackStateRef = useRef(getPlaybackState);
  const initialRoomStateAppliedRef = useRef(false);
  const participant = user ?? { id: guest.id, nickname: guest.nickname, avatar: null };

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    getPlaybackStateRef.current = getPlaybackState;
  }, [getPlaybackState]);

  const isConnected = status === "connected";
  const isMaster = Boolean(participantId && participantId === masterParticipantId);
  const canPlayPause = isConnected && (isMaster || allowParticipantControls);
  const canSeek = isConnected && (isMaster || allowParticipantSeeking);
  const canSelectEpisodes = isConnected && (isMaster || allowParticipantEpisodeSelection);
  const canSelectTranslations =
    isConnected && syncTranslations && (isMaster || allowParticipantTranslationSelection);
  const canMasterControl = isConnected && isMaster;
  const inviteUrl = useMemo(() => buildInviteUrl(roomId), [roomId]);

  useEffect(() => {
    const controller = new AbortController();
    setSettingsLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/settings/watch-party", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: WatchPartyRuntimeSettings };
        if (!controller.signal.aborted && data.settings) {
          setSettings({
            enabled: data.settings.enabled,
            allowGuests: data.settings.allowGuests,
          });
        }
      } catch {
        /* settings fallback keeps the feature available in dev before db:push */
      } finally {
        if (!controller.signal.aborted) setSettingsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const send = useCallback((message: WatchPartyClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leave" }));
      ws.close();
    } else {
      ws?.close();
    }
    setStatus("idle");
    setRoomId(null);
    setParticipantId(null);
    setMasterParticipantId(null);
    setAllowParticipantControlsState(false);
    setAllowParticipantSeekingState(false);
    setAllowParticipantEpisodeSelectionState(false);
    setAllowParticipantTranslationSelectionState(false);
    setSyncTranslationsState(true);
    setParticipants([]);
    setError(null);
    setUrlRoomId(null);
    clearWatchRoomFromLocation();
    initialRoomStateAppliedRef.current = false;
  }, []);

  const connect = useCallback(
    (targetRoomId: string | null) => {
      const state = getPlaybackStateRef.current();
      const wsUrl = buildWatchPartyWsUrl();
      if (!settings.enabled) {
        setError("Совместный просмотр выключен администратором.");
        return false;
      }
      if (!user && !settings.allowGuests) {
        setError("Вход гостям в совместный просмотр выключен.");
        return false;
      }
      if (!state || !wsUrl) {
        setError("Плеер ещё не готов для создания комнаты.");
        return false;
      }

      wsRef.current?.close();
      setStatus("connecting");
      setError(null);
      initialRoomStateAppliedRef.current = false;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        const joinState = getPlaybackStateRef.current() ?? state;
        const message: WatchPartyClientMessage = {
          type: "join",
          protocolVersion: WATCH_PARTY_PROTOCOL_VERSION,
          roomId: targetRoomId,
          participant: {
            userId: participant.id,
            nickname: participant.nickname,
            avatar: participant.avatar,
          },
          state: joinState,
        };
        ws.send(JSON.stringify(message));
      });

      ws.addEventListener("message", (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!isServerMessage(parsed)) return;

        if (parsed.type === "error") {
          if (
            typeof window !== "undefined" &&
            parsed.roomId &&
            parsed.shikimoriId &&
            parsed.shikimoriId !== shikimoriId
          ) {
            setError("Комната открыта для другого тайтла. Переходим...");
            window.location.assign(buildRoomRedirectUrl(parsed.shikimoriId, parsed.roomId));
            return;
          }
          setError(parsed.message);
          setStatus("error");
          return;
        }

        if (parsed.type === "room-state") {
          setStatus("connected");
          setRoomId(parsed.roomId);
          setUrlRoomId(parsed.roomId);
          setWatchRoomInLocation(parsed.roomId);
          setParticipantId(parsed.participantId);
          setMasterParticipantId(parsed.masterParticipantId);
          setAllowParticipantControlsState(parsed.allowParticipantControls);
          setAllowParticipantSeekingState(parsed.allowParticipantSeeking);
          setAllowParticipantEpisodeSelectionState(
            parsed.allowParticipantEpisodeSelection ?? parsed.allowParticipantSeeking,
          );
          setAllowParticipantTranslationSelectionState(
            parsed.allowParticipantTranslationSelection ?? false,
          );
          setSyncTranslationsState(parsed.syncTranslations ?? true);
          setParticipants(parsed.participants);
          setError(null);
          if (
            !initialRoomStateAppliedRef.current &&
            parsed.participantId !== parsed.masterParticipantId
          ) {
            initialRoomStateAppliedRef.current = true;
            onCommandRef.current({ type: "state-sync", state: parsed.state });
          }
          return;
        }

        if (parsed.type === "command") {
          onCommandRef.current(parsed.command);
        }
      });

      ws.addEventListener("close", () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setStatus((current) => (current === "idle" ? current : "error"));
        setError((current) => current ?? "Соединение с комнатой закрыто.");
      });

      ws.addEventListener("error", () => {
        if (wsRef.current !== ws) return;
        setStatus("error");
        setError("Не удалось подключиться к WebSocket комнаты.");
      });

      return true;
    },
    [
      participant.avatar,
      participant.id,
      participant.nickname,
      settings.allowGuests,
      settings.enabled,
      shikimoriId,
      user,
    ],
  );

  const createRoom = useCallback(() => connect(null), [connect]);
  const joinRoom = useCallback((targetRoomId: string) => connect(targetRoomId), [connect]);

  const setRoomPermissions = useCallback(
    (patch: Partial<WatchPartyRoomPermissions>) => {
      if (!isMaster) return;
      const nextControls = patch.allowParticipantControls ?? allowParticipantControls;
      const nextSeeking = patch.allowParticipantSeeking ?? allowParticipantSeeking;
      const nextEpisodeSelection =
        patch.allowParticipantEpisodeSelection ?? allowParticipantEpisodeSelection;
      const nextTranslationSelection =
        patch.allowParticipantTranslationSelection ?? allowParticipantTranslationSelection;
      const nextSyncTranslations = patch.syncTranslations ?? syncTranslations;
      setAllowParticipantControlsState(nextControls);
      setAllowParticipantSeekingState(nextSeeking);
      setAllowParticipantEpisodeSelectionState(nextEpisodeSelection);
      setAllowParticipantTranslationSelectionState(nextTranslationSelection);
      setSyncTranslationsState(nextSyncTranslations);
      send({
        type: "set-permissions",
        allowParticipantControls: nextControls,
        allowParticipantSeeking: nextSeeking,
        allowParticipantEpisodeSelection: nextEpisodeSelection,
        allowParticipantTranslationSelection: nextTranslationSelection,
        syncTranslations: nextSyncTranslations,
      });
    },
    [
      allowParticipantControls,
      allowParticipantEpisodeSelection,
      allowParticipantSeeking,
      allowParticipantTranslationSelection,
      isMaster,
      send,
      syncTranslations,
    ],
  );

  const sendCommand = useCallback(
    (type: WatchPartyCommand["type"], state?: WatchPartyPlaybackState | null) => {
      const nextState = state ?? getPlaybackStateRef.current();
      if (!nextState || !isConnected) return false;
      if (type === "play" || type === "pause") {
        if (!canPlayPause) return false;
      } else if (type === "seek") {
        if (!canSeek) return false;
      } else if (type === "episode") {
        if (!canSelectEpisodes) return false;
      } else if (type === "translation") {
        if (!canSelectTranslations) return false;
      } else if (!canMasterControl) {
        return false;
      }
      return send({ type, state: nextState } as WatchPartyClientMessage);
    },
    [
      canMasterControl,
      canPlayPause,
      canSeek,
      canSelectEpisodes,
      canSelectTranslations,
      isConnected,
      send,
    ],
  );

  const sendPresence = useCallback(
    (state?: WatchPartyPlaybackState | null) => {
      const nextState = state ?? getPlaybackStateRef.current();
      if (!nextState || !isConnected) return false;
      return send({ type: "presence", state: nextState });
    },
    [isConnected, send],
  );

  const requestSync = useCallback(() => {
    if (!isConnected) return false;
    return send({ type: "request-sync" });
  }, [isConnected, send]);

  useEffect(() => disconnect, [disconnect]);

  return {
    status,
    roomId,
    inviteUrl,
    participantId,
    masterParticipantId,
    participants,
    settings,
    settingsLoading,
    allowParticipantControls,
    allowParticipantSeeking,
    allowParticipantEpisodeSelection,
    allowParticipantTranslationSelection,
    syncTranslations,
    isConnected,
    isMaster,
    canPlayPause,
    canSeek,
    canSelectEpisodes,
    canSelectTranslations,
    canMasterControl,
    error,
    guestNickname: guest.nickname,
    urlRoomId,
    createRoom,
    joinRoom,
    disconnect,
    setRoomPermissions,
    sendCommand,
    sendPresence,
    requestSync,
  };
}
