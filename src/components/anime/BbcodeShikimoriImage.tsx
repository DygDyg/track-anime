"use client";

import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import type { ShikimoriImageSize } from "@/lib/shikimori-bbcode";

type Props = {
  imageId: string;
  src: string | null;
  size?: ShikimoriImageSize;
  className?: string;
};

export function BbcodeShikimoriImage({ src, size, className = "" }: Props) {
  const style =
    size?.width || size?.height
      ? {
          width: size.width ? `${size.width}px` : undefined,
          height: size.height ? `${size.height}px` : undefined,
          maxWidth: "100%",
        }
      : undefined;

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      {...EXTERNAL_IMG_ATTRS}
      style={style}
      className={[
        "my-1 inline-block max-w-full rounded-md border border-border/60 bg-background/30 object-contain",
        className,
      ].join(" ")}
    />
  );
}
