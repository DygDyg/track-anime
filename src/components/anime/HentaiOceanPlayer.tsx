"use client";

type Props = {
  embedUrl: string;
  title?: string;
};

/** Iframe Hentai Ocean (16:9), только после согласия 18+. */
export function HentaiOceanPlayer({ embedUrl, title }: Props) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={embedUrl}
        title={title ? `Смотреть: ${title}` : "Hentai Ocean"}
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
