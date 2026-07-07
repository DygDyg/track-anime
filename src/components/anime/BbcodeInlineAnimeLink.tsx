"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimeLink } from "@/components/AnimeLink";
import {
  ReleaseCardHoverPanel,
  computeHoverPanelOffsetX,
} from "@/components/ReleaseCardHoverPanel";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { HoverPanelRelease } from "@/lib/hover-panel-release";

const previewCache = new Map<number, HoverPanelRelease>();
const previewInflight = new Map<number, Promise<HoverPanelRelease | null>>();

async function fetchAnimeHoverPreview(shikimoriId: number): Promise<HoverPanelRelease | null> {
  if (previewCache.has(shikimoriId)) {
    return previewCache.get(shikimoriId) ?? null;
  }

  const inflight = previewInflight.get(shikimoriId);
  if (inflight) return inflight;

  const promise = fetch(`/api/anime/${shikimoriId}/hover-preview`)
    .then(async (response) => {
      if (!response.ok) return null;
      return (await response.json()) as HoverPanelRelease;
    })
    .catch(() => null)
    .then((preview) => {
      if (preview) previewCache.set(shikimoriId, preview);
      return preview;
    })
    .finally(() => {
      previewInflight.delete(shikimoriId);
    });

  previewInflight.set(shikimoriId, promise);
  return promise;
}

type Props = {
  shikimoriId: number;
  children: ReactNode;
  className?: string;
};

export function BbcodeInlineAnimeLink({ shikimoriId, children, className = "" }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [release, setRelease] = useState<HoverPanelRelease | null>(
    () => previewCache.get(shikimoriId) ?? null,
  );
  const [panelOffsetX, setPanelOffsetX] = useState(0);
  const { settings } = useSiteSettings();

  const updatePanelOffset = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPanelOffsetX(computeHoverPanelOffsetX(el.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    if (!hovered || release) return;

    let cancelled = false;
    void fetchAnimeHoverPreview(shikimoriId).then((preview) => {
      if (!cancelled && preview) setRelease(preview);
    });

    return () => {
      cancelled = true;
    };
  }, [hovered, release, shikimoriId]);

  const handlePointerEnter = () => {
    hoveredRef.current = true;
    setHovered(true);
    updatePanelOffset();
  };

  const handlePointerLeave = (event: PointerEvent<HTMLSpanElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && anchorRef.current?.contains(next)) return;
    if (next instanceof Node && panelRef.current?.contains(next)) return;
    hoveredRef.current = false;
    setHovered(false);
  };

  useEffect(() => {
    const onViewportChange = () => {
      if (!hoveredRef.current) return;
      updatePanelOffset();
    };

    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
    return () => {
      window.removeEventListener("scroll", onViewportChange, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [updatePanelOffset]);

  return (
    <span
      ref={anchorRef}
      className="relative inline"
      style={{ "--hover-panel-x": `${panelOffsetX}px` } as CSSProperties}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <AnimeLink href={`/anime/${shikimoriId}`} className={className}>
        {children}
      </AnimeLink>
      {release ? (
        <ReleaseCardHoverPanel
          release={release}
          visible={hovered}
          previewUrl={release.screenshotUrl}
          animeHref={`/anime/${shikimoriId}`}
          trailerEnabled={settings.hoverTrailerEnabled}
          trailerDelaySec={settings.hoverTrailerDelaySec}
          portal
          anchorRef={anchorRef}
          panelRef={panelRef}
          panelOffsetX={panelOffsetX}
        />
      ) : null}
    </span>
  );
}
