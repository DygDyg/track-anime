"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import type { CharacterHoverPreview } from "@/lib/shikimori/characters";
import {
  computeHoverPanelOffsetX,
  computeHoverPortalStyle,
  HOVER_PORTAL_ESTIMATED_HEIGHT,
} from "@/lib/hover-portal-position";
import { PANEL_WIDTH_PX } from "@/components/ReleaseCardHoverPanel";

const previewCache = new Map<number, CharacterHoverPreview>();
const previewInflight = new Map<number, Promise<CharacterHoverPreview | null>>();

async function fetchCharacterHoverPreview(characterId: number): Promise<CharacterHoverPreview | null> {
  if (previewCache.has(characterId)) {
    return previewCache.get(characterId) ?? null;
  }

  const inflight = previewInflight.get(characterId);
  if (inflight) return inflight;

  const promise = fetch(`/api/characters/${characterId}/hover-preview`)
    .then(async (response) => {
      if (!response.ok) return null;
      return (await response.json()) as CharacterHoverPreview;
    })
    .catch(() => null)
    .then((preview) => {
      if (preview) previewCache.set(characterId, preview);
      return preview;
    })
    .finally(() => {
      previewInflight.delete(characterId);
    });

  previewInflight.set(characterId, promise);
  return promise;
}

function stripDescription(text: string | null): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain || null;
}

type Props = {
  characterId: number;
  profileUrl: string;
  children: ReactNode;
  className?: string;
};

export function BbcodeInlineCharacterLink({
  characterId,
  profileUrl,
  children,
  className = "",
}: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [preview, setPreview] = useState<CharacterHoverPreview | null>(
    () => previewCache.get(characterId) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [panelOffsetX, setPanelOffsetX] = useState(0);
  const [portalMounted, setPortalMounted] = useState(false);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});

  const updatePanelOffset = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPanelOffsetX(computeHoverPanelOffsetX(el.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!hovered || preview) return;

    let cancelled = false;
    setLoading(true);
    void fetchCharacterHoverPreview(characterId)
      .then((next) => {
        if (!cancelled && next) setPreview(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hovered, preview, characterId]);

  useLayoutEffect(() => {
    if (!hovered || !anchorRef.current) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const panelHeight = panelRef.current?.offsetHeight ?? HOVER_PORTAL_ESTIMATED_HEIGHT;
      setPortalStyle(
        computeHoverPortalStyle(
          anchor.getBoundingClientRect(),
          PANEL_WIDTH_PX,
          panelOffsetX,
          panelHeight,
        ),
      );
    };

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [hovered, panelOffsetX, preview]);

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

  const description = stripDescription(preview?.description ?? null);

  const panelNode =
    hovered && portalMounted ? (
      <div
        ref={panelRef}
        className={[
          "release-card-hover-panel release-card-hover-panel--portal hidden md:block",
          hovered ? "is-visible" : "",
        ].join(" ")}
        style={portalStyle}
        aria-hidden={!hovered}
      >
        <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/70 ring-1 ring-white/5">
          <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-dim">
            {preview?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                {...EXTERNAL_IMG_ATTRS}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted">
                {loading ? <LoadingSpinner size="sm" /> : "Нет изображения"}
              </div>
            )}
          </div>

          <div className="space-y-2 bg-card p-3">
            {preview ? (
              <>
                <Link
                  href={preview.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-semibold leading-snug text-foreground hover:text-accent"
                >
                  {preview.title}
                </Link>
                {description ? (
                  <p className="line-clamp-4 text-xs leading-relaxed text-foreground/90">{description}</p>
                ) : (
                  <p className="text-xs text-muted">Описание пока недоступно.</p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <span
      ref={anchorRef}
      className="relative inline"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Link href={profileUrl} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </Link>
      {panelNode ? createPortal(panelNode, document.body) : null}
    </span>
  );
}
