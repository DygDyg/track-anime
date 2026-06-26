import type { NextRequest } from "next/server";
import { resolveAuthOrigin } from "@/lib/auth/config";

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Публичный origin запроса: Host / X-Forwarded-* (dev за прокси часто видит localhost в nextUrl). */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const hostHeader = firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));

  const host = forwardedHost ?? hostHeader;
  if (host) {
    const proto =
      forwardedProto ??
      (request.nextUrl.protocol ? request.nextUrl.protocol.replace(/:$/, "") : null) ??
      "http";
    return resolveAuthOrigin(`${proto}://${host}`);
  }

  return resolveAuthOrigin(request.nextUrl.origin);
}

export function isPublicHostRequest(request: NextRequest): boolean {
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  if (!host) return false;

  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return !isLocalHostname(hostname);
}
