"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
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
import { labelKind } from "@/lib/anime-labels";
import { getAnimeKindDescription } from "@/lib/anime-kind-descriptions";
import { buildAdvancedSearchHref } from "@/lib/search-fields";

const TOOLTIP_WIDTH = 280;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 8;

type Props = {
  kind: string | null | undefined;
  children?: ReactNode;
  className?: string;
};

function computeTooltipStyle(anchor: DOMRect, tooltipHeight: number): CSSProperties {
  const leftRight = anchor.right + TOOLTIP_GAP;
  const leftLeft = anchor.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
  const fitsRight = leftRight + TOOLTIP_WIDTH <= window.innerWidth - TOOLTIP_MARGIN;
  const left = fitsRight
    ? leftRight
    : Math.max(TOOLTIP_MARGIN, leftLeft);

  const top = Math.min(
    Math.max(anchor.top + anchor.height / 2 - tooltipHeight / 2, TOOLTIP_MARGIN),
    Math.max(TOOLTIP_MARGIN, window.innerHeight - tooltipHeight - TOOLTIP_MARGIN),
  );

  return {
    position: "fixed",
    left,
    top,
    width: TOOLTIP_WIDTH,
    zIndex: 260,
  };
}

export function AnimeKindInfoLink({ kind, children, className = "" }: Props) {
  const label = labelKind(kind ?? null);
  const description = getAnimeKindDescription(kind);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 120;
    setStyle(computeTooltipStyle(anchor.getBoundingClientRect(), tooltipHeight));
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition]);

  const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && anchorRef.current?.contains(next)) return;
    if (next instanceof Node && tooltipRef.current?.contains(next)) return;
    setVisible(false);
  };

  if (!kind || !label) return null;

  const tooltip =
    visible && mounted && description
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={style}
            onPointerEnter={() => setVisible(true)}
            onPointerLeave={handlePointerLeave}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-foreground shadow-2xl shadow-black/60 ring-1 ring-white/5"
          >
            <p className="text-[11px] font-semibold uppercase text-muted">Тип</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{label}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">{description}</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Link
        ref={anchorRef}
        href={buildAdvancedSearchHref({ kind })}
        className={className}
        onPointerEnter={() => {
          if (description) setVisible(true);
        }}
        onPointerLeave={handlePointerLeave}
        onFocus={() => {
          if (description) setVisible(true);
        }}
        onBlur={() => setVisible(false)}
      >
        {children ?? label}
      </Link>
      {tooltip}
    </>
  );
}
