"use client";

import { useMemo } from "react";
import {
  CvhVideoPlayerEmbed,
  type CvhPlayerEpisodeChange,
  type CvhPlayerProgressPayload,
} from "@/components/anime/CvhVideoPlayerEmbed";
import {
  buildCvhIframePath,
  type CvhAggregator,
} from "@/lib/cvh-player";

type EmbedMode = "iframe" | "inline";

type Props = {
  titleId: string;
  aggregator: CvhAggregator;
  publisherId?: string;
  episode?: number | null;
  season?: number | null;
  priorityVoice?: string | null;
  showVoiceOnly?: boolean;
  /** inline (default, Partners) mounts widget on-page; iframe keeps `/cdn-iframe` shell */
  mode?: EmbedMode;
  title?: string;
  className?: string;
  onEpisodeChange?: (payload: CvhPlayerEpisodeChange) => void;
  onProgress?: (payload: CvhPlayerProgressPayload) => void;
  onPause?: (payload: CvhPlayerProgressPayload) => void;
};

export function CvhPlayerFrame({
  titleId,
  aggregator,
  publisherId,
  episode,
  season,
  priorityVoice,
  showVoiceOnly = false,
  mode = "inline",
  title,
  className,
  onEpisodeChange,
  onProgress,
  onPause,
}: Props) {
  const iframeSrc = useMemo(
    () =>
      buildCvhIframePath({
        aggr: aggregator,
        id: titleId,
        episode,
        season,
        voice: priorityVoice,
        pub: publisherId,
      }),
    [aggregator, titleId, episode, season, priorityVoice, publisherId],
  );

  if (mode === "inline") {
    return (
      <div
        className={[
          "aspect-video overflow-hidden bg-black",
          className ?? "rounded-lg border border-border",
        ].join(" ")}
      >
        <CvhVideoPlayerEmbed
          titleId={titleId}
          publisherId={publisherId}
          aggregator={aggregator}
          episode={episode}
          season={season}
          priorityVoice={priorityVoice}
          showVoiceOnly={showVoiceOnly}
          onEpisodeChange={onEpisodeChange}
          onProgress={onProgress}
          onPause={onPause}
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "aspect-video overflow-hidden bg-black",
        className ?? "rounded-lg border border-border",
      ].join(" ")}
    >
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        title={title ?? "VideoHUB"}
        className="h-full w-full border-0"
        allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
