"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export type TaPlusPlayerProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  source?: "episode" | "time";
};

type Props = {
  src: string | null;
  title?: string;
  seasonNumber: number;
  episodeNumber: number;
  initialPositionSeconds?: number | null;
  className?: string;
  onProgress?: (payload: TaPlusPlayerProgressPayload) => void;
  onPause?: (payload: TaPlusPlayerProgressPayload) => void;
  onPlaying?: () => void;
};

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== ""
  );
}

export function TaPlusPlayer({
  src,
  title,
  seasonNumber,
  episodeNumber,
  initialPositionSeconds = null,
  className,
  onProgress,
  onPause,
  onPlaying,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekAppliedForSrcRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setError(null);
      return;
    }

    setError(null);
    seekAppliedForSrcRef.current = null;
    let disposed = false;

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    destroyHls();
    video.removeAttribute("src");
    video.load();

    const applyInitialSeek = () => {
      if (seekAppliedForSrcRef.current === src) return;
      const target = initialPositionSeconds;
      if (target == null || !Number.isFinite(target) || target < 1) {
        seekAppliedForSrcRef.current = src;
        return;
      }
      try {
        video.currentTime = Math.max(0, target);
      } catch {
        /* ignore */
      }
      seekAppliedForSrcRef.current = src;
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (disposed) return;
        applyInitialSeek();
        void video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data.fatal) return;
        setError("Не удалось воспроизвести поток");
      });
    } else if (canPlayNativeHls(video)) {
      video.src = src;
      const onLoaded = () => {
        if (disposed) return;
        applyInitialSeek();
        void video.play().catch(() => undefined);
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
    } else {
      setError("Браузер не поддерживает HLS");
    }

    return () => {
      disposed = true;
      destroyHls();
    };
  }, [src, initialPositionSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const emit = (source: "episode" | "time") => {
      onProgress?.({
        seasonNumber,
        episodeNumber,
        positionSeconds: video.currentTime || 0,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        source,
      });
    };

    const onTimeUpdate = () => emit("time");
    const onPlay = () => {
      onPlaying?.();
      emit("time");
    };
    const onPauseEvent = () => {
      onPause?.({
        seasonNumber,
        episodeNumber,
        positionSeconds: video.currentTime || 0,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        source: "time",
      });
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPauseEvent);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPauseEvent);
    };
  }, [episodeNumber, onPause, onPlaying, onProgress, seasonNumber]);

  return (
    <div className={["relative aspect-video overflow-hidden bg-black", className ?? ""].join(" ")}>
      <video
        ref={videoRef}
        className="h-full w-full"
        controls
        playsInline
        preload="metadata"
        title={title}
      />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white">
          {error}
        </div>
      ) : null}
      {!src && !error ? (
        <div className="absolute inset-0 animate-pulse bg-surface-dim" />
      ) : null}
    </div>
  );
}
