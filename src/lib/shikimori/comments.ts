import { shikimoriFetch } from "@/lib/shikimori/client";
import { getShikimoriAnimeCachedOnly } from "@/lib/shikimori/animes";

const COMMENTS_PAGE_SIZE = 20;

type ShikimoriTopicBrief = {
  id: number;
  type: string;
  topic_title: string;
  comments_count: number;
};

type ShikimoriCommentUser = {
  id: number;
  nickname: string;
  avatar: string | null;
  url: string;
};

export type ShikimoriComment = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  is_offtopic: boolean;
  user: ShikimoriCommentUser | null;
};

async function fetchAnimeTopicId(shikimoriId: number): Promise<number | null> {
  const cached = await getShikimoriAnimeCachedOnly(shikimoriId);
  const fromCache = cached?.topic_id ?? cached?.thread_id;
  if (fromCache) return fromCache;

  const anime = await shikimoriFetch<{ topic_id?: number | null; thread_id?: number | null }>(
    `/animes/${shikimoriId}`,
  );
  return anime?.topic_id ?? anime?.thread_id ?? null;
}

export async function fetchAnimeDiscussionTopic(
  shikimoriId: number,
): Promise<{ id: number; commentsCount: number; title: string } | null> {
  const topicId = await fetchAnimeTopicId(shikimoriId);
  if (!topicId) return null;

  const topic = await shikimoriFetch<ShikimoriTopicBrief>(`/topics/${topicId}`);
  if (!topic) return null;

  return {
    id: topic.id,
    commentsCount: topic.comments_count ?? 0,
    title: topic.topic_title,
  };
}

export async function fetchTopicComments(
  topicId: number,
  page = 1,
  limit = COMMENTS_PAGE_SIZE,
): Promise<{ comments: ShikimoriComment[]; hasMore: boolean }> {
  const items = await shikimoriFetch<ShikimoriComment[]>(
    `/comments?commentable_type=Topic&commentable_id=${topicId}&page=${page}&limit=${limit}`,
  );
  if (!items?.length) return { comments: [], hasMore: false };

  const hasMore = items.length > limit;
  return {
    comments: hasMore ? items.slice(0, limit) : items,
    hasMore,
  };
}

export async function fetchCommentById(id: number): Promise<ShikimoriComment | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  return shikimoriFetch<ShikimoriComment>(`/comments/${id}`);
}

export async function fetchCommentsByIds(ids: number[]): Promise<Map<number, ShikimoriComment>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return new Map();

  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const comment = await fetchCommentById(id);
        return comment ? ([id, comment] as const) : null;
      } catch {
        return null;
      }
    }),
  );

  return new Map(entries.filter((entry): entry is readonly [number, ShikimoriComment] => entry != null));
}

export { COMMENTS_PAGE_SIZE };
