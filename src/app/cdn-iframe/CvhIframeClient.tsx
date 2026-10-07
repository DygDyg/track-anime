"use client";

import { CvhVideoPlayerEmbed } from "@/components/anime/CvhVideoPlayerEmbed";

type Props = {
  titleId: string;
  aggregator: string;
  publisherId?: string;
  episode?: number | null;
  season?: number | null;
  priorityVoice?: string | null;
};

export function CvhIframeClient(props: Props) {
  return (
    <div className="cvh-iframe-page fixed inset-0 z-[9999] bg-black">
      <CvhVideoPlayerEmbed
        {...props}
        embedShell
        className="h-full w-full"
      />
    </div>
  );
}
