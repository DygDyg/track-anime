"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { resolveSlideshowBackgroundUrls } from "@/lib/site-settings";

type Props = {
  urls: string[];
};

const ROTATE_MS = 12_000;
const CROSSFADE_MS = 1200;

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
  const images = useMemo(
    () => resolveSlideshowBackgroundUrls(urls, settings.backgroundSlideshowFilter),
    [settings.backgroundSlideshowFilter, urls],
  );
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
    if (images.length <= 1 || !ready || settings.reduceMotion) return;

    const timer = window.setInterval(() => {
      const nextIndex = (indexRef.current + 1) % images.length;
      const nextUrl = images[nextIndex]!;
      const inactiveSlot = activeSlotRef.current === 0 ? 1 : 0;

      setSlotSrc((current) => {
        const updated: [string, string] = [...current];
        updated[inactiveSlot] = nextUrl;
        return updated;
      });

      requestAnimationFrame(() => {
        activeSlotRef.current = inactiveSlot;
        setActiveSlot(inactiveSlot);
        indexRef.current = nextIndex;
      });
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [images, imagesKey, ready, settings.reduceMotion]);

  if (!ready || images.length === 0) return null;

  const baseUrl = slotSrc[activeSlot] || slotSrc[0] || images[0];

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {baseUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={baseUrl}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[6px] brightness-[0.92]"
        />
      ) : null}

      {!settings.reduceMotion && images.length > 1
        ? slotSrc.map((url, slot) =>
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={slot}
                src={url}
                alt=""
                decoding="async"
                className={[
                  "absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[6px] brightness-[0.92] will-change-[opacity] transition-opacity ease-in-out",
                  activeSlot === slot ? "opacity-100" : "opacity-0",
                ].join(" ")}
                style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
              />
            ) : null,
          )
        : null}

      <div className="site-bg-dim absolute inset-0" />
    </div>
  );
}
