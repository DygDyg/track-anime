import { prisma } from "@/lib/prisma";

export const PLAYER_PROXY_SETTINGS_ID = "default";

const SETTINGS_CACHE_MS = 30_000;

export type PlayerProxyScheme = "socks5" | "socks5h" | "http";

export type PlayerProxySettingsDto = {
  enabled: boolean;
  scheme: PlayerProxyScheme | null;
  host: string | null;
  port: number | null;
  username: string | null;
  hasPassword: boolean;
  updatedAt: string;
};

export const DEFAULT_PLAYER_PROXY_SETTINGS_DTO: PlayerProxySettingsDto = {
  enabled: false,
  scheme: null,
  host: null,
  port: null,
  username: null,
  hasPassword: false,
  updatedAt: new Date(0).toISOString(),
};

export class PlayerProxySettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerProxySettingsError";
  }
}

type PlayerProxyParts = {
  scheme: PlayerProxyScheme;
  host: string;
  port: number;
  username: string;
  password: string;
};

type PlayerProxyRow = {
  enabled: boolean;
  proxyUrl: string;
  updatedAt: Date;
};

type PlayerProxyDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; enabled: boolean; proxyUrl: string };
    update: Partial<{ enabled: boolean; proxyUrl: string }>;
  }): Promise<PlayerProxyRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<PlayerProxyRow>;
  update(args: {
    where: { id: string };
    data: Partial<{ enabled: boolean; proxyUrl: string }>;
  }): Promise<PlayerProxyRow>;
};

let cachedRow: { value: PlayerProxyRow; at: number } | null = null;

function getDelegate(): PlayerProxyDelegate | null {
  return (
    prisma as unknown as {
      playerProxySettings?: PlayerProxyDelegate;
    }
  ).playerProxySettings ?? null;
}

export function parsePlayerProxyUrl(raw: string): PlayerProxyParts | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "socks5" && scheme !== "socks5h" && scheme !== "http") return null;
  const host = url.hostname.trim();
  const port = Number(url.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    scheme,
    host,
    port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export function formatPlayerProxyUrl(parts: PlayerProxyParts): string {
  const user = encodeURIComponent(parts.username);
  const pass = encodeURIComponent(parts.password);
  const auth =
    parts.username || parts.password
      ? `${user}${parts.password ? `:${pass}` : ""}@`
      : "";
  return `${parts.scheme}://${auth}${parts.host}:${parts.port}`;
}

export function toPlayerProxySettingsDto(row: {
  enabled: boolean;
  proxyUrl: string;
  updatedAt: Date;
}): PlayerProxySettingsDto {
  const parsed = parsePlayerProxyUrl(row.proxyUrl);
  return {
    enabled: row.enabled,
    scheme: parsed?.scheme ?? null,
    host: parsed?.host ?? null,
    port: parsed?.port ?? null,
    username: parsed?.username || null,
    hasPassword: Boolean(parsed?.password),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function invalidateCache(): void {
  cachedRow = null;
}

async function ensurePlayerProxySettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }
  await delegate.upsert({
    where: { id: PLAYER_PROXY_SETTINGS_ID },
    create: { id: PLAYER_PROXY_SETTINGS_ID, enabled: false, proxyUrl: "" },
    update: {},
  });
}

async function readRow(): Promise<PlayerProxyRow> {
  if (cachedRow && Date.now() - cachedRow.at < SETTINGS_CACHE_MS) {
    return cachedRow.value;
  }
  await ensurePlayerProxySettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("PlayerProxySettings delegate missing");
  const row = await delegate.findUniqueOrThrow({ where: { id: PLAYER_PROXY_SETTINGS_ID } });
  cachedRow = { value: row, at: Date.now() };
  return row;
}

export async function getPlayerProxySettingsDto(): Promise<PlayerProxySettingsDto> {
  try {
    return toPlayerProxySettingsDto(await readRow());
  } catch (error) {
    console.warn("[player-proxy] settings fallback:", error);
    return DEFAULT_PLAYER_PROXY_SETTINGS_DTO;
  }
}

/** Full proxy URL for the parser header. Null keeps the proxy baked into index.php. */
export async function getPlayerProxyUrlForParser(): Promise<string | null> {
  try {
    const row = await readRow();
    if (!row.enabled) return null;
    const parsed = parsePlayerProxyUrl(row.proxyUrl);
    if (!parsed) return null;
    return formatPlayerProxyUrl(parsed);
  } catch (error) {
    console.warn("[player-proxy] parser url fallback:", error);
    return null;
  }
}

export async function updatePlayerProxySettings(input: {
  enabled?: boolean;
  proxyUrl?: string;
  password?: string;
}): Promise<PlayerProxySettingsDto> {
  await ensurePlayerProxySettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("PlayerProxySettings delegate missing");
  const current = await delegate.findUniqueOrThrow({ where: { id: PLAYER_PROXY_SETTINGS_ID } });

  let nextUrl = current.proxyUrl;
  const nextEnabled = input.enabled ?? current.enabled;

  if (input.proxyUrl !== undefined) {
    const trimmed = input.proxyUrl.trim();
    if (!trimmed) {
      nextUrl = "";
    } else {
      const parsed = parsePlayerProxyUrl(trimmed);
      if (!parsed) {
        throw new PlayerProxySettingsError("Нужен адрес вида socks5://логин@хост:порт");
      }
      const existing = parsePlayerProxyUrl(current.proxyUrl);
      if (!parsed.password && input.password === undefined && existing?.password) {
        parsed.password = existing.password;
      }
      if (input.password !== undefined) parsed.password = input.password;
      nextUrl = formatPlayerProxyUrl(parsed);
    }
  } else if (input.password !== undefined) {
    const existing = parsePlayerProxyUrl(current.proxyUrl);
    if (!existing) {
      throw new PlayerProxySettingsError("Сначала укажите адрес прокси");
    }
    existing.password = input.password;
    nextUrl = formatPlayerProxyUrl(existing);
  }

  if (nextEnabled && !parsePlayerProxyUrl(nextUrl)) {
    throw new PlayerProxySettingsError("Чтобы включить прокси, укажите адрес");
  }

  const row = await delegate.update({
    where: { id: PLAYER_PROXY_SETTINGS_ID },
    data: { enabled: nextEnabled, proxyUrl: nextUrl },
  });
  invalidateCache();
  cachedRow = { value: row, at: Date.now() };
  return toPlayerProxySettingsDto(row);
}
