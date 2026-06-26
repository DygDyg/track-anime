"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolvePosterUrl } from "@/lib/poster";

type Props = {
  urls: string[];
  fallbackUrl: string | null;
  title: string;
};

const ROTATE_MS = 8000;
const CROSSFADE_MS = 1000;

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

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function AnimeScreenshotBackground({ urls, fallbackUrl, title }: Props) {
  const images = useMemo(() => {
    const unique = [...new Set(urls.filter(Boolean))];
    if (unique.length > 0) return unique;
    const poster = resolvePosterUrl(fallbackUrl);
    return poster ? [poster] : [];
  }, [fallbackUrl, urls]);

  const imagesKey = images.join("|");
  const [slotSrc, setSlotSrc] = useState<[string, string]>(["", ""]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [ready, setReady] = useState(false);

  const indexRef = useRef(0);
  const activeSlotRef = useRef<0 | 1>(0);

  useEffect(() => {
    indexRef.current = 0;
    activeSlotRef.current = 0;
    setActiveSlot(0);
    setReady(false);

    if (images.length === 0) {
      setSlotSrc(["", ""]);
      return;
    }

    let cancelled = false;
    const first = images[0]!;

    void Promise.all(images.map(preloadImage)).then(() => {
      if (cancelled) return;
      setSlotSrc([first, first]);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [imagesKey, images]);

  useEffect(() => {
    if (images.length <= 1 || !ready) return;

    let cancelled = false;

    const advance = async () => {
      const nextIndex = (indexRef.current + 1) % images.length;
      const nextUrl = images[nextIndex]!;
      await preloadImage(nextUrl);
      if (cancelled) return;

      const inactiveSlot = (activeSlotRef.current === 0 ? 1 : 0) as 0 | 1;

      setSlotSrc((prev) => {
        const next: [string, string] = [...prev];
        next[inactiveSlot] = nextUrl;
        return next;
      });

      await waitForPaint();
      if (cancelled) return;

      activeSlotRef.current = inactiveSlot;
      indexRef.current = nextIndex;
      setActiveSlot(inactiveSlot);
    };

    const id = window.setInterval(() => void advance(), ROTATE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [images, imagesKey, ready]);

  if (images.length === 0) return null;

  const screenshotAlt = `Скриншот из «${title}»`;
  const baseUrl = slotSrc[0] || images[0]!;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      <div className="absolute inset-0 bg-background" />

      {baseUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={baseUrl}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-md brightness-[0.35]"
        />
      ) : null}

      {ready
        ? slotSrc.map((url, slot) =>
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={slot}
                src={url}
                alt={screenshotAlt}
                decoding="async"
                className={[
                  "absolute inset-0 h-full w-full scale-105 object-cover object-center will-change-[opacity] transition-opacity ease-in-out",
                  activeSlot === slot ? "opacity-100" : "opacity-0",
                ].join(" ")}
                style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
              />
            ) : null,
          )
        : null}

      <div className="anime-page-bg-dim absolute inset-0" />
    </div>
  );
}
