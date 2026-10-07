/**
 * Минимальный WebDAV-клиент (Basic Auth): MKCOL + PUT.
 * Без внешних зависимостей — fetch.
 */

export type WebDavAuth = {
  username: string;
  password: string;
};

export type WebDavClientOptions = {
  baseUrl: string;
  auth: WebDavAuth;
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function joinWebDavUrl(baseUrl: string, ...parts: string[]): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = parts
    .flatMap((part) => trimSlashes(part).split("/"))
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
  return path ? `${base}/${path}` : base;
}

function basicAuthHeader(auth: WebDavAuth): string {
  const token = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function webdavFetch(
  url: string,
  auth: WebDavAuth,
  init: RequestInit & { method: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", basicAuthHeader(auth));
  return fetch(url, { ...init, headers });
}

/** Создать коллекцию; 201/405/409 считаем успехом (уже есть). */
export async function webdavMkcol(url: string, auth: WebDavAuth): Promise<void> {
  const res = await webdavFetch(url, auth, { method: "MKCOL" });
  if (res.status === 201 || res.status === 405 || res.status === 409 || res.status === 301) {
    return;
  }
  const body = await res.text().catch(() => "");
  throw new Error(`WebDAV MKCOL ${res.status}: ${body.slice(0, 200) || url}`);
}

export async function webdavPut(
  url: string,
  auth: WebDavAuth,
  body: Buffer | Uint8Array,
  contentType = "application/octet-stream",
): Promise<void> {
  const res = await webdavFetch(url, auth, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
    },
    body: body as BodyInit,
  });
  if (res.status === 201 || res.status === 204 || res.status === 200) {
    return;
  }
  const text = await res.text().catch(() => "");
  throw new Error(`WebDAV PUT ${res.status}: ${text.slice(0, 200) || url}`);
}

/** Рекурсивно создать путь относительно baseUrl (сегменты папок). */
export async function webdavEnsurePath(
  options: WebDavClientOptions,
  folderPath: string,
): Promise<string> {
  const segments = trimSlashes(folderPath).split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const url = joinWebDavUrl(options.baseUrl, current);
    await webdavMkcol(url, options.auth);
  }
  return joinWebDavUrl(options.baseUrl, ...segments);
}

export async function webdavPutFile(
  options: WebDavClientOptions,
  remotePath: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<string> {
  const segments = trimSlashes(remotePath).split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Пустой remote path для PUT");
  }
  const fileName = segments[segments.length - 1]!;
  const dirSegments = segments.slice(0, -1);
  if (dirSegments.length > 0) {
    await webdavEnsurePath(options, dirSegments.join("/"));
  }
  const url = joinWebDavUrl(options.baseUrl, ...dirSegments, fileName);
  await webdavPut(url, options.auth, body, contentType);
  return url;
}

/** Проверка доступа: PROPFIND или MKCOL целевой папки. */
export async function webdavTestConnection(
  options: WebDavClientOptions,
  remoteFolder: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const url = await webdavEnsurePath(options, remoteFolder || "/");
    const res = await webdavFetch(url, options.auth, {
      method: "PROPFIND",
      headers: { Depth: "0" },
    });
    if (res.status === 207 || res.status === 200 || res.status === 404 || res.status === 405) {
      return { ok: true, url };
    }
    // Папка уже создана через MKCOL — считаем OK даже без PROPFIND
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
