"use client";

import Image from "next/image";
import { SITE_LOGO_ALT } from "@/lib/site-brand";

type BrandLoadingProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLoading({ className = "", compact = false }: BrandLoadingProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-5" : "gap-3 py-8 sm:py-10",
        className,
      ].join(" ")}
    >
      <Image
        src="/api/brand/logo"
        alt={SITE_LOGO_ALT}
        width={1536}
        height={1024}
        className={[
          "h-auto w-auto animate-pulse object-contain drop-shadow-[0_0_22px_rgba(108,140,255,0.28)]",
          compact ? "max-h-24 max-w-[12rem]" : "max-h-36 max-w-[16rem] sm:max-h-44 sm:max-w-[20rem]",
        ].join(" ")}
        priority={!compact}
        unoptimized
      />
      <p
        className={[
          "text-xs font-black text-foreground sm:text-sm",
          compact ? "" : "text-sm sm:text-base",
        ].join(" ")}
      >
        ЗАГРУЗКА...
      </p>
    </div>
  );
}

export function BrandLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/72 px-4 pt-10 backdrop-blur-sm"
      aria-hidden
    >
      <BrandLoading compact />
    </div>
  );
}
