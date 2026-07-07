"use client";

import { useEffect, useMemo, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { resolveBackgroundImageUrl } from "@/lib/site-settings";

type Props = {
  urls: string[];
};

const preloaded = new Set<string>();

function preloadImage(url: string): Promise<void> {
  if (preloaded.has(url)) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    const finish = () => {
      preloaded.add(url);
      resolve();
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = url;
  });
}

export function SiteBackground({ urls }: Props) {
  const { settings } = useSiteSettings();
  const imageUrl = useMemo(
    () => resolveBackgroundImageUrl(urls, settings.backgroundImageUrl),
    [settings.backgroundImageUrl, urls],
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);

    if (!imageUrl) return;

    let cancelled = false;

    void preloadImage(imageUrl).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  if (!imageUrl || !ready) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[6px] brightness-[0.92]"
      />
      <div className="site-bg-dim absolute inset-0" />
    </div>
  );
}
