import "dotenv/config";
import { randomUUID } from "node:crypto";
import wsPackage from "ws";

const port = Number(process.env.WATCH_PARTY_PORT ?? 3001);
const path = process.env.WATCH_PARTY_WS_PATH ?? "/watch-party-ws";
const heartbeatMs = 30_000;
const rooms = new Map();
const WebSocketServer = wsPackage.WebSocketServer ?? wsPackage.Server;

function createRoomId() {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeParticipant(input) {
  if (!isRecord(input)) return null;
  const userId = typeof input.userId === "string" && input.userId ? input.userId : null;
  const nickname = typeof input.nickname === "string" && input.nickname ? input.nickname : null;
  if (!userId || !nickname) return null;
  return {
    userId,
    nickname: nickname.slice(0, 80),
    avatar: typeof input.avatar === "string" && input.avatar ? input.avatar : null,
  };
}

function normalizeState(input) {
  if (!isRecord(input)) return null;
  const shikimoriId = Number(input.shikimoriId);
  const seasonNumber = Number(input.seasonNumber);
  const episodeNumber = Number(input.episodeNumber);
  const positionSeconds = Number(input.positionSeconds);
  const updatedAt = Number(input.updatedAt);
  const kodikId = typeof input.kodikId === "string" && input.kodikId ? input.kodikId : null;
  if (
    !Number.isInteger(shikimoriId) ||
    shikimoriId <= 0 ||
    !kodikId ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber) ||
    !Number.isFinite(positionSeconds)
  ) {
    return null;
  }
  return {
    shikimoriId,
    kodikId,
    seasonNumber,
    episodeNumber,
    positionSeconds: Math.max(0, positionSeconds),
    isPlaying: input.isPlaying === true,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

function advanceRoomState(state) {
  if (!state.isPlaying) return state;
  const elapsedSeconds = Math.max(0, (Date.now() - state.updatedAt) / 1000);
  return {
    ...state,
    positionSeconds: state.positionSeconds + elapsedSeconds,
    updatedAt: Date.now(),
  };
}

function serializeParticipants(room) {
  return [...room.clients.values()].map((client) => ({
    id: client.id,
    userId: client.userId,
    nickname: client.nickname,
    avatar: client.avatar,
    isMaster: client.id === room.masterParticipantId,
    state: client.state,
  }));
}

function send(ws, message) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(message));
}

function broadcastRoomState(room) {
  const participants = serializeParticipants(room);
  for (const client of room.clients.values()) {
    send(client.ws, {
      type: "room-state",
      roomId: room.id,
      participantId: client.id,
      masterParticipantId: room.masterParticipantId,
      allowParticipantControls: room.allowParticipantControls,
      allowParticipantSeeking: room.allowParticipantSeeking,
      participants,
      state: room.state,
    });
  }
}

function canSendCommand(room, client, commandType) {
  if (client.id === room.masterParticipantId) return true;
  if (room.allowParticipantControls && (commandType === "play" || commandType === "pause")) {
    return true;
  }
  return room.allowParticipantSeeking && (commandType === "seek" || commandType === "episode");
}

function handleJoin(ws, message) {
  const participant = normalizeParticipant(message.participant);
  const state = normalizeState(message.state);
  if (!participant || !state) {
    send(ws, { type: "error", message: "Некорректные данные комнаты." });
    ws.close(1008, "Invalid room payload");
    return;
  }

  const requestedRoomId = typeof message.roomId === "string" && message.roomId ? message.roomId : null;
  const roomId = requestedRoomId ?? createRoomId();
  let room = rooms.get(roomId);

  if (!room) {
    room = {
      id: roomId,
      state,
      allowParticipantControls: false,
      allowParticipantSeeking: false,
      masterParticipantId: "",
      clients: new Map(),
    };
    rooms.set(roomId, room);
  } else if (room.state.shikimoriId !== state.shikimoriId) {
    send(ws, { type: "error", message: "Комната создана для другого тайтла." });
    ws.close(1008, "Anime mismatch");
    return;
  }

  const client = {
    id: randomUUID(),
    ws,
    userId: participant.userId,
    nickname: participant.nickname,
    avatar: participant.avatar,
    roomId,
    alive: true,
    state,
  };
  ws.watchPartyClient = client;
  room.clients.set(client.id, client);
  if (!room.masterParticipantId) room.masterParticipantId = client.id;
  broadcastRoomState(room);
}

function handleLeave(ws) {
  const client = ws.watchPartyClient;
  if (!client) return;

  const room = rooms.get(client.roomId);
  ws.watchPartyClient = null;
  if (!room) return;

  room.clients.delete(client.id);
  if (room.clients.size === 0) {
    rooms.delete(room.id);
    return;
  }

  if (room.masterParticipantId === client.id) {
    room.masterParticipantId = room.clients.keys().next().value;
  }
  broadcastRoomState(room);
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    send(ws, { type: "error", message: "Сообщение комнаты не распознано." });
    return;
  }

  if (!isRecord(message) || typeof message.type !== "string") return;
  if (message.type === "join") {
    handleJoin(ws, message);
    return;
  }
  if (message.type === "leave") {
    handleLeave(ws);
    return;
  }

  const client = ws.watchPartyClient;
  const room = client ? rooms.get(client.roomId) : null;
  if (!client || !room) return;

  if (message.type === "set-permissions") {
    if (client.id !== room.masterParticipantId) return;
    room.allowParticipantControls = message.allowParticipantControls === true;
    room.allowParticipantSeeking = message.allowParticipantSeeking === true;
    broadcastRoomState(room);
    return;
  }

  if (message.type === "presence") {
    const incomingState = normalizeState(message.state);
    if (!incomingState || incomingState.shikimoriId !== room.state.shikimoriId) return;
    client.state = incomingState;
    broadcastRoomState(room);
    return;
  }

  if (!["play", "pause", "seek", "episode", "translation", "state-sync"].includes(message.type)) {
    return;
  }
  if (!canSendCommand(room, client, message.type)) {
    send(ws, { type: "error", message: "Управлять комнатой может только мастер." });
    return;
  }

  const incomingState = normalizeState(message.state);
  if (!incomingState || incomingState.shikimoriId !== room.state.shikimoriId) return;
  client.state = incomingState;

  const isMaster = client.id === room.masterParticipantId;
  const advancedState = advanceRoomState(room.state);
  const state =
    isMaster || message.type === "state-sync"
      ? incomingState
      : {
          ...advancedState,
          seasonNumber:
            message.type === "episode" ? incomingState.seasonNumber : advancedState.seasonNumber,
          episodeNumber:
            message.type === "episode" ? incomingState.episodeNumber : advancedState.episodeNumber,
          positionSeconds:
            message.type === "seek" || message.type === "episode"
              ? incomingState.positionSeconds
              : advancedState.positionSeconds,
          isPlaying:
            message.type === "play"
              ? true
              : message.type === "pause"
                ? false
                : advancedState.isPlaying,
          updatedAt: Date.now(),
        };
  room.state = state;

  const command = { type: message.type, state };
  for (const other of room.clients.values()) {
    if (other.id === client.id) continue;
    send(other.ws, { type: "command", fromParticipantId: client.id, command });
  }
}

const wss = new WebSocketServer({ port, path });

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("message", (raw) => handleMessage(ws, raw));
  ws.on("close", () => handleLeave(ws));
  ws.on("error", () => handleLeave(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, heartbeatMs);

wss.on("close", () => clearInterval(heartbeat));

console.log(`Watch party WebSocket server listening on ws://0.0.0.0:${port}${path}`);
