import type { ImageCacheKind } from "@/lib/image-cache";

export function buildCachedImageUrl(kind: ImageCacheKind, url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return `/api/image-cache?type=${kind}&url=${encodeURIComponent(url)}`;
}
