"use client";

import { useEffect, useRef } from "react";
import {
  DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS,
  clampAmbientGlowBlur,
  clampAmbientGlowBrightness,
  clampAmbientGlowDownscale,
  clampAmbientGlowOpacity,
  clampAmbientGlowSaturate,
  clampAmbientGlowScale,
  clampAmbientGlowUpdateIntervalMs,
  type PlayerAmbientGlowSettings,
} from "@/lib/player-ambient-glow";

/** Hard cap so high downscale on 4K sources stays cheap. */
const BUFFER_LONG_MAX = 256;

type Props = {
  video: HTMLVideoElement | null;
  /** When false, canvas is unmounted and no loops run. */
  active: boolean;
  settings?: Partial<Omit<PlayerAmbientGlowSettings, "enabled">> | null;
};

/**
 * Lightest YouTube-style ambient glow: drawImage into a tiny canvas + CSS blur.
 * No getImageData / pixel JS. Stops completely when inactive, paused, or hidden.
 */
export function VideoAmbientGlow({ video, active, settings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opacity = clampAmbientGlowOpacity(
    settings?.opacity ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.opacity,
  );
  const blurPx = clampAmbientGlowBlur(
    settings?.blur ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.blur,
  );
  const brightness = clampAmbientGlowBrightness(
    settings?.brightness ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.brightness,
  );
  const saturate = clampAmbientGlowSaturate(
    settings?.saturate ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.saturate,
  );
  const scale = clampAmbientGlowScale(
    settings?.scale ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.scale,
  );
  const downscale = clampAmbientGlowDownscale(
    settings?.downscale ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.downscale,
  );
  const updateIntervalMs = clampAmbientGlowUpdateIntervalMs(
    settings?.updateIntervalMs ?? DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS.updateIntervalMs,
  );
  const downscaleRef = useRef(downscale);
  const intervalRef = useRef(updateIntervalMs);
  downscaleRef.current = downscale;
  intervalRef.current = updateIntervalMs;

  useEffect(() => {
    if (!active || !video) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let cancelled = false;
    let rafId: number | null = null;
    let rvfcId: number | null = null;
    let lastDrawMs = 0;

    const syncBufferSize = () => {
      const vw = Math.max(1, video.videoWidth || 16);
      const vh = Math.max(1, video.videoHeight || 9);
      const factor = downscaleRef.current;
      let width = Math.max(1, Math.round(vw * factor));
      let height = Math.max(1, Math.round(vh * factor));
      const long = Math.max(width, height);
      if (long > BUFFER_LONG_MAX) {
        const shrink = BUFFER_LONG_MAX / long;
        width = Math.max(1, Math.round(width * shrink));
        height = Math.max(1, Math.round(height * shrink));
      }
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const stopLoops = () => {
      if (rvfcId != null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(rvfcId);
        rvfcId = null;
      }
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const draw = (now: number) => {
      if (cancelled || document.hidden || video.paused || video.ended) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (now - lastDrawMs < intervalRef.current) return;
      lastDrawMs = now;
      syncBufferSize();
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        /* decode / transient failures */
      }
    };

    const schedule = () => {
      if (cancelled || document.hidden || video.paused || video.ended) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        rvfcId = video.requestVideoFrameCallback(() => {
          rvfcId = null;
          draw(performance.now());
          schedule();
        });
        return;
      }
      rafId = requestAnimationFrame((now) => {
        rafId = null;
        draw(now);
        schedule();
      });
    };

    const onPlay = () => {
      stopLoops();
      schedule();
    };

    const onStop = () => stopLoops();

    const onVisibility = () => {
      if (document.hidden) {
        stopLoops();
        return;
      }
      if (!video.paused && !video.ended) schedule();
    };

    syncBufferSize();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStop);
    video.addEventListener("ended", onStop);
    video.addEventListener("loadedmetadata", syncBufferSize);
    document.addEventListener("visibilitychange", onVisibility);

    if (!video.paused && !video.ended) schedule();

    return () => {
      cancelled = true;
      stopLoops();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("ended", onStop);
      video.removeEventListener("loadedmetadata", syncBufferSize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, video]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="ta-plus-ambient-glow"
      aria-hidden
      style={{
        opacity,
        transform: `scale(${scale})`,
        filter: `blur(${blurPx}px) saturate(${saturate}) brightness(${brightness})`,
      }}
    />
  );
}
