/** Device media stream volume for TA player gestures (Vanced-style, Android shell). */

export const PLAYER_STREAM_VOLUME_MIN = 0;
export const PLAYER_STREAM_VOLUME_MAX = 1;

export type TrackAnimeAndroidStreamVolumeBridge = {
  setStreamVolume?: ((value: number) => void) | unknown;
  getStreamVolume?: (() => number) | unknown;
  hasStreamVolumeControl?: (() => boolean) | unknown;
};

function bridge(): TrackAnimeAndroidStreamVolumeBridge | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    TrackAnimeAndroid?: TrackAnimeAndroidStreamVolumeBridge;
  };
  const api = win.TrackAnimeAndroid;
  if (!api) return null;
  if (api.setStreamVolume == null) return null;
  return api;
}

function callSetStreamVolume(api: TrackAnimeAndroidStreamVolumeBridge, value: number): boolean {
  const fn = api.setStreamVolume;
  if (typeof fn !== "function") return false;
  try {
    (fn as (value: number) => void).call(api, value);
    return true;
  } catch {
    return false;
  }
}

function callGetStreamVolume(api: TrackAnimeAndroidStreamVolumeBridge): number | null {
  const fn = api.getStreamVolume;
  if (typeof fn !== "function") return null;
  try {
    const raw = (fn as () => number).call(api);
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    return clampPlayerStreamVolume(raw);
  } catch {
    return null;
  }
}

export function clampPlayerStreamVolume(value: number): number {
  if (!Number.isFinite(value)) return PLAYER_STREAM_VOLUME_MAX;
  return Math.min(PLAYER_STREAM_VOLUME_MAX, Math.max(PLAYER_STREAM_VOLUME_MIN, value));
}

export function hasNativePlayerStreamVolume(): boolean {
  const api = bridge();
  if (!api) return false;
  const probe = api.hasStreamVolumeControl;
  if (typeof probe === "function") {
    try {
      return Boolean((probe as () => boolean).call(api));
    } catch {
      return false;
    }
  }
  return api.setStreamVolume != null;
}

export function readNativePlayerStreamVolume(): number | null {
  const api = bridge();
  if (!api) return null;
  return callGetStreamVolume(api);
}

/**
 * On Android native shell: system STREAM_MUSIC volume.
 * Returns null when no bridge — caller should fall back to Kodik player volume.
 */
export function applyPlayerStreamVolume(value: number): number | null {
  const next = clampPlayerStreamVolume(value);
  const api = bridge();
  if (api && callSetStreamVolume(api, next)) {
    return next;
  }
  return null;
}
