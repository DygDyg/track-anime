import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

export const DISCORD_SETTINGS_ID = "default";

export type DiscordSettingsDto = {
  applicationId: string | null;
  largeImageKey: string;
  bridgeDownloadUrl: string | null;
  updatedAt: string;
  source: "database" | "env" | "none";
};

let cachedApplicationId: { value: string | null; at: number } | null = null;
const CACHE_MS = 30_000;

function hasDiscordSettingsModel(): boolean {
  const delegate = (prisma as { discordSettings?: { upsert?: unknown } }).discordSettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateDiscordSettingsCache(): void {
  cachedApplicationId = null;
}

export function normalizeDiscordApplicationId(raw: unknown): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!id) return null;
  if (!/^\d{17,20}$/.test(id)) return null;
  return id;
}

export function normalizeDiscordLargeImageKey(raw: unknown): string {
  if (typeof raw !== "string") return "logo";
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return key || "logo";
}

export function normalizeDiscordBridgeDownloadUrl(raw: unknown): string | null {
  if (raw == null) return null;
  const url = String(raw).trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function readEnvBridgeDownloadUrl(): string | null {
  return normalizeDiscordBridgeDownloadUrl(process.env.NEXT_PUBLIC_DISCORD_RPC_DOWNLOAD_URL);
}

function readDefaultBridgeDownloadUrl(): string | null {
  return normalizeDiscordBridgeDownloadUrl(`${getSiteUrl()}/downloads/TrackAnimeDiscordRPC.exe`);
}

function resolveBridgeDownloadUrl(raw: string | null | undefined): string | null {
  return (
    normalizeDiscordBridgeDownloadUrl(raw) ??
    readEnvBridgeDownloadUrl() ??
    readDefaultBridgeDownloadUrl()
  );
}

function readEnvApplicationId(): string | null {
  return (
    normalizeDiscordApplicationId(process.env.DISCORD_APP_ID) ??
    normalizeDiscordApplicationId(process.env.NEXT_PUBLIC_DISCORD_APP_ID)
  );
}

export async function ensureDiscordSettings(): Promise<void> {
  if (!hasDiscordSettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.discordSettings.upsert({
    where: { id: DISCORD_SETTINGS_ID },
    create: {
      id: DISCORD_SETTINGS_ID,
      applicationId: readEnvApplicationId(),
    },
    update: {},
  });
}

export async function getDiscordApplicationId(): Promise<string | null> {
  if (cachedApplicationId && Date.now() - cachedApplicationId.at < CACHE_MS) {
    return cachedApplicationId.value;
  }

  try {
    await ensureDiscordSettings();
    const row = await prisma.discordSettings.findUniqueOrThrow({
      where: { id: DISCORD_SETTINGS_ID },
    });
    const value = normalizeDiscordApplicationId(row.applicationId) ?? readEnvApplicationId();
    cachedApplicationId = { value, at: Date.now() };
    return value;
  } catch {
    const value = readEnvApplicationId();
    cachedApplicationId = { value, at: Date.now() };
    return value;
  }
}

export async function getDiscordSettingsDto(): Promise<DiscordSettingsDto> {
  await ensureDiscordSettings();
  const row = await prisma.discordSettings.findUniqueOrThrow({
    where: { id: DISCORD_SETTINGS_ID },
  });

  const fromDb = normalizeDiscordApplicationId(row.applicationId);
  const fromEnv = readEnvApplicationId();
  const applicationId = fromDb ?? fromEnv;
  const bridgeDownloadUrlRaw = (row as { bridgeDownloadUrl?: string | null }).bridgeDownloadUrl;

  return {
    applicationId,
    largeImageKey: normalizeDiscordLargeImageKey(row.largeImageKey),
    bridgeDownloadUrl: resolveBridgeDownloadUrl(bridgeDownloadUrlRaw),
    updatedAt: row.updatedAt.toISOString(),
    source: fromDb ? "database" : fromEnv ? "env" : "none",
  };
}

export async function updateDiscordSettings(input: {
  applicationId?: string | null;
  largeImageKey?: string;
  bridgeDownloadUrl?: string | null;
}): Promise<DiscordSettingsDto> {
  await ensureDiscordSettings();

  const data: {
    applicationId?: string | null;
    largeImageKey?: string;
    bridgeDownloadUrl?: string | null;
  } = {};

  if ("applicationId" in input) {
    const normalized = normalizeDiscordApplicationId(input.applicationId);
    if (input.applicationId != null && input.applicationId !== "" && !normalized) {
      throw new Error("Application ID должен содержать 17–20 цифр");
    }
    data.applicationId = normalized;
  }

  if (input.largeImageKey != null) {
    data.largeImageKey = normalizeDiscordLargeImageKey(input.largeImageKey);
  }

  if ("bridgeDownloadUrl" in input) {
    const normalized = normalizeDiscordBridgeDownloadUrl(input.bridgeDownloadUrl);
    if (input.bridgeDownloadUrl != null && input.bridgeDownloadUrl !== "" && !normalized) {
      throw new Error("Ссылка на скачивание должна быть корректным http(s) URL");
    }
    data.bridgeDownloadUrl = normalized;
  }

  await prisma.discordSettings.update({
    where: { id: DISCORD_SETTINGS_ID },
    data,
  });

  invalidateDiscordSettingsCache();
  return getDiscordSettingsDto();
}

export async function getDiscordPublicConfig(): Promise<{
  applicationId: string | null;
  largeImageKey: string;
  bridgeDownloadUrl: string | null;
}> {
  const settings = await getDiscordSettingsDto();
  return {
    applicationId: settings.applicationId,
    largeImageKey: settings.largeImageKey,
    bridgeDownloadUrl: settings.bridgeDownloadUrl,
  };
}
