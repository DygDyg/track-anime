import type { Metadata } from "next";
import { CvhIframeClient } from "./CvhIframeClient";

export const metadata: Metadata = {
  title: "VideoHUB",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function CdnIframePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const id = first(params.id)?.trim() ?? "";
  const aggr = first(params.aggr)?.trim() || "mal";
  const pub = first(params.pub)?.trim() || undefined;
  const voice = first(params.voice)?.trim() || null;
  const episode = parsePositiveInt(first(params.episode));
  const season = parsePositiveInt(first(params.season));

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-sm text-white/80">
        Не указан id тайтла для VideoHUB
      </div>
    );
  }

  return (
    <CvhIframeClient
      titleId={id}
      aggregator={aggr}
      publisherId={pub}
      episode={episode}
      season={season}
      priorityVoice={voice}
    />
  );
}
