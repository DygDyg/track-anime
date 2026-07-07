import { unstable_cache } from "next/cache";
import { getShikimoriEndpoints } from "@/lib/shikimori/endpoints";

const TOPIC_IMAGE_PAGES = 5;

function parseImageMapFromHtml(html: string): Record<string, string> {
  const map: Record<string, string> = {};

  const patterns = [
    /href="(https?:\/\/[^"]+\/system\/user_images[^"]+)"[^>]*data-attrs="\{&quot;id&quot;:(\d+)\}"/g,
    /data-attrs="\{&quot;id&quot;:(\d+)\}"[^>]*href="(https?:\/\/[^"]+\/system\/user_images[^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      if (pattern === patterns[0]) {
        map[match[2]] = match[1];
      } else {
        map[match[1]] = match[2];
      }
    }
  }

  return map;
}

async function fetchTopicCommentImageMapUncached(topicId: number): Promise<Record<string, string>> {
  const { siteOrigin } = await getShikimoriEndpoints();
  const map: Record<string, string> = {};

  for (let page = 1; page <= TOPIC_IMAGE_PAGES; page += 1) {
    const response = await fetch(`${siteOrigin}/forum/${topicId}?page=${page}`, {
      headers: { "User-Agent": "TrackAnime/1.0" },
      next: { revalidate: 3600 },
    }).catch(() => null);

    if (!response?.ok) break;

    const html = await response.text();
    if (!html.includes("b-comment")) break;

    Object.assign(map, parseImageMapFromHtml(html));

    if (!html.includes(`page=${page + 1}`)) break;
  }

  return map;
}

export async function fetchTopicCommentImageMap(topicId: number): Promise<Record<string, string>> {
  return unstable_cache(
    async () => fetchTopicCommentImageMapUncached(topicId),
    ["topic-comment-images", String(topicId)],
    { revalidate: 86_400 },
  )();
}

export const SHIKIMORI_IMAGE_TAG_RE = /\[image=(\d+)(?:\s+[^\]]*)?\]/gi;

export function extractShikimoriImageIdsFromText(text: string): number[] {
  const ids = new Set<number>();
  const re = new RegExp(SHIKIMORI_IMAGE_TAG_RE.source, SHIKIMORI_IMAGE_TAG_RE.flags);

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }

  return [...ids];
}
