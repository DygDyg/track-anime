"use client";

import { useEffect, useState } from "react";

const BACKGROUND_STORAGE_KEY = "track-anime-bg";

type Props = {
  urls: string[];
};

export function SiteBackground({ urls }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (urls.length === 0) {
      setUrl(null);
      return;
    }

    const stored = sessionStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (stored && urls.includes(stored)) {
      setUrl(stored);
      return;
    }

    const next = urls[Math.floor(Math.random() * urls.length)]!;
    sessionStorage.setItem(BACKGROUND_STORAGE_KEY, next);
    setUrl(next);
  }, [urls]);

  if (!url) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[6px]"
      />
      <div className="site-bg-dim absolute inset-0" />
    </div>
  );
}
