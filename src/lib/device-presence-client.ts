import { isTrackAnimeAndroidApp } from "@/lib/android-app";
import { isTrackAnimeWindowsApp } from "@/lib/windows-app";
import type { DevicePresenceClientKind, DevicePresenceDto } from "@/lib/device-presence";

export const DEVICE_KEY_STORAGE = "ta.deviceKey";

export function getOrCreateDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE)?.trim();
    if (existing && existing.length >= 8) return existing;
    const key =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_KEY_STORAGE, key);
    return key;
  } catch {
    return `ephemeral_${Date.now().toString(36)}`;
  }
}

export function detectClientKind(): DevicePresenceClientKind {
  if (typeof navigator === "undefined") return "browser";
  if (isTrackAnimeWindowsApp()) return "windows";
  if (isTrackAnimeAndroidApp()) return "android";
  return "browser";
}

export function clientKindLabel(kind: DevicePresenceClientKind): string {
  switch (kind) {
    case "android":
      return "Android";
    case "windows":
      return "Windows";
    default:
      return "Браузер";
  }
}

export async function fetchUserDevices(): Promise<DevicePresenceDto[]> {
  const deviceKey = getOrCreateDeviceKey();
  const res = await fetch(`/api/user/devices?deviceKey=${encodeURIComponent(deviceKey)}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { devices?: DevicePresenceDto[] };
  return Array.isArray(data.devices) ? data.devices : [];
}

export async function postDevicePresence(pathWithSearch: string, title: string | null): Promise<void> {
  const deviceKey = getOrCreateDeviceKey();
  if (!deviceKey) return;
  await fetch("/api/user/devices/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceKey,
      clientKind: detectClientKind(),
      lastPath: pathWithSearch,
      lastTitle: title,
    }),
  });
}

export async function renameThisDevice(displayName: string): Promise<DevicePresenceDto | null> {
  const deviceKey = getOrCreateDeviceKey();
  const res = await fetch("/api/user/devices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey, displayName }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { device?: DevicePresenceDto };
  return data.device ?? null;
}
