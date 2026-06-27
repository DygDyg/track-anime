import { prisma } from "@/lib/prisma";

export const SHIKIMORI_SETTINGS_ID = "default";

export const SHIKIMORI_HOST_PRESETS = ["shikimori.io", "shikimori.one"] as const;

export const DEFAULT_SHIKIMORI_HOST =
  process.env.SHIKIMORI_HOST?.trim().toLowerCase() || "shikimori.io";

export type ShikimoriEndpoints = {
  host: string;
  apiBase: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  whoamiUrl: string;
  siteOrigin: string;
  updatedAt: string;
};

export type ShikimoriSettingsDto = {
  host: string;
  updatedAt: string;
  endpoints: ShikimoriEndpoints;
};

let cachedEndpoints: { value: ShikimoriEndpoints; at: number } | null = null;
const ENDPOINTS_CACHE_MS = 30_000;

function hasShikimoriSettingsModel(): boolean {
  const delegate = (prisma as { shikimoriSettings?: { upsert?: unknown } }).shikimoriSettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateShikimoriEndpointsCache(): void {
  cachedEndpoints = null;
}

export function normalizeShikimoriHost(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SHIKIMORI_HOST;

  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!host || !/^[a-z0-9.-]+$/.test(host)) {
    return DEFAULT_SHIKIMORI_HOST;
  }

  return host;
}

export function buildShikimoriEndpoints(
  host: string,
  updatedAt: string = new Date(0).toISOString(),
): ShikimoriEndpoints {
  const normalizedHost = normalizeShikimoriHost(host);
  const origin = `https://${normalizedHost}`;

  return {
    host: normalizedHost,
    apiBase: `${origin}/api`,
    oauthAuthorizeUrl: `${origin}/oauth/authorize`,
    oauthTokenUrl: `${origin}/oauth/token`,
    whoamiUrl: `${origin}/api/users/whoami`,
    siteOrigin: origin,
    updatedAt,
  };
}

export function getShikimoriEndpointsCached(): ShikimoriEndpoints {
  if (cachedEndpoints && Date.now() - cachedEndpoints.at < ENDPOINTS_CACHE_MS) {
    return cachedEndpoints.value;
  }

  return buildShikimoriEndpoints(DEFAULT_SHIKIMORI_HOST);
}

export async function ensureShikimoriSettings(): Promise<void> {
  if (!hasShikimoriSettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.shikimoriSettings.upsert({
    where: { id: SHIKIMORI_SETTINGS_ID },
    create: {
      id: SHIKIMORI_SETTINGS_ID,
      host: DEFAULT_SHIKIMORI_HOST,
    },
    update: {},
  });
}

export async function getShikimoriEndpoints(): Promise<ShikimoriEndpoints> {
  if (cachedEndpoints && Date.now() - cachedEndpoints.at < ENDPOINTS_CACHE_MS) {
    return cachedEndpoints.value;
  }

  try {
    await ensureShikimoriSettings();
    const row = await prisma.shikimoriSettings.findUniqueOrThrow({
      where: { id: SHIKIMORI_SETTINGS_ID },
    });
    const value = buildShikimoriEndpoints(row.host, row.updatedAt.toISOString());
    cachedEndpoints = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[shikimori] endpoints fallback:", error);
    const value = buildShikimoriEndpoints(DEFAULT_SHIKIMORI_HOST);
    cachedEndpoints = { value, at: Date.now() };
    return value;
  }
}

export async function getShikimoriSettingsDto(): Promise<ShikimoriSettingsDto> {
  const endpoints = await getShikimoriEndpoints();
  return {
    host: endpoints.host,
    updatedAt: endpoints.updatedAt,
    endpoints,
  };
}

export async function updateShikimoriHost(host: string): Promise<ShikimoriSettingsDto> {
  const normalizedHost = normalizeShikimoriHost(host);
  await ensureShikimoriSettings();

  await prisma.shikimoriSettings.update({
    where: { id: SHIKIMORI_SETTINGS_ID },
    data: { host: normalizedHost },
  });

  invalidateShikimoriEndpointsCache();
  return getShikimoriSettingsDto();
}

export function shikimoriSiteUrl(
  path: string,
  endpoints: ShikimoriEndpoints = getShikimoriEndpointsCached(),
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${endpoints.siteOrigin}${normalizedPath}`;
}

export function shikimoriAssetUrl(
  path: string | null | undefined,
  endpoints: ShikimoriEndpoints = getShikimoriEndpointsCached(),
): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (/\/assets\/globals\/missing_/i.test(path)) return null;
  return `${endpoints.siteOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}
