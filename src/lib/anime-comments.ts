import { unstable_cache } from "next/cache";
import {
  COMMENTS_PAGE_SIZE,
  fetchAnimeDiscussionTopic,
  fetchCommentById,
  fetchTopicComments,
  type ShikimoriComment,
} from "@/lib/shikimori/comments";
import { extractShikimoriRepliesIdsFromText } from "@/lib/shikimori-bbcode";
import { fetchTopicCommentImageMap } from "@/lib/shikimori/topic-images";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";

export type CommentReplyDto = {
  id: number;
  body: string;
  createdAt: string;
  user: {
    nickname: string;
    avatarUrl: string | null;
    profileUrl: string;
  };
};

export type AnimeCommentDto = {
  id: number;
  body: string;
  createdAt: string;
  isOfftopic: boolean;
  user: {
    id: number;
    nickname: string;
    avatarUrl: string | null;
    profileUrl: string;
  };
};

export type AnimeCommentsPageDto = {
  topicId: number | null;
  topicUrl: string | null;
  commentsCount: number;
  comments: AnimeCommentDto[];
  replies: Record<string, CommentReplyDto>;
  images: Record<string, string>;
  page: number;
  hasMore: boolean;
};

const COMMENTS_CACHE_SECONDS = 600;
const MAX_REPLIES_FETCH = 30;

function normalizeCommentBody(body: string): string {
  return body.replace(/\[comment=\d+;\d+\],?\s*/g, "").trim();
}

function mapCommentReply(comment: ShikimoriComment): CommentReplyDto | null {
  if (!comment.user) return null;

  return {
    id: comment.id,
    body: normalizeCommentBody(comment.body),
    createdAt: comment.created_at,
    user: {
      nickname: comment.user.nickname,
      avatarUrl: comment.user.avatar,
      profileUrl: comment.user.url,
    },
  };
}

function mapComment(comment: ShikimoriComment): AnimeCommentDto | null {
  if (!comment.user) return null;

  return {
    id: comment.id,
    body: normalizeCommentBody(comment.body),
    createdAt: comment.created_at,
    isOfftopic: comment.is_offtopic,
    user: {
      id: comment.user.id,
      nickname: comment.user.nickname,
      avatarUrl: comment.user.avatar,
      profileUrl: comment.user.url,
    },
  };
}

async function resolveReplyComments(
  comments: AnimeCommentDto[],
  replyIds: number[],
): Promise<Record<string, CommentReplyDto>> {
  const replies: Record<string, CommentReplyDto> = {};
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  for (const id of replyIds.slice(0, MAX_REPLIES_FETCH)) {
    const fromPage = commentsById.get(id);
    if (fromPage) {
      replies[String(id)] = {
        id: fromPage.id,
        body: fromPage.body,
        createdAt: fromPage.createdAt,
        user: {
          nickname: fromPage.user.nickname,
          avatarUrl: fromPage.user.avatarUrl,
          profileUrl: fromPage.user.profileUrl,
        },
      };
    }
  }

  return replies;
}

async function getCachedCommentReply(id: number): Promise<CommentReplyDto | null> {
  return unstable_cache(
    async () => {
      const comment = await fetchCommentById(id);
      return comment ? mapCommentReply(comment) : null;
    },
    ["shikimori-comment-reply", String(id)],
    { revalidate: COMMENTS_CACHE_SECONDS },
  )();
}

async function resolveReplyCommentsCached(replyIds: number[]): Promise<Record<string, CommentReplyDto>> {
  const uniqueIds = [...new Set(replyIds.filter((id) => Number.isFinite(id) && id > 0))].slice(
    0,
    MAX_REPLIES_FETCH,
  );
  if (uniqueIds.length === 0) return {};

  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const reply = await getCachedCommentReply(id);
      return reply ? ([String(id), reply] as const) : null;
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, CommentReplyDto] => entry != null));
}

async function getAnimeCommentsPageUncached(
  shikimoriId: number,
  page: number,
): Promise<AnimeCommentsPageDto> {
  const topic = await fetchAnimeDiscussionTopic(shikimoriId);
  if (!topic) {
    return {
      topicId: null,
      topicUrl: null,
      commentsCount: 0,
      comments: [],
      replies: {},
      images: {},
      page,
      hasMore: false,
    };
  }

  const { comments, hasMore } = await fetchTopicComments(topic.id, page, COMMENTS_PAGE_SIZE);
  const mappedComments = comments.map(mapComment).filter((item): item is AnimeCommentDto => item != null);

  const replyIds = mappedComments.flatMap((comment) => extractShikimoriRepliesIdsFromText(comment.body));
  const repliesFromPage = await resolveReplyComments(mappedComments, replyIds);
  const missingReplyIds = replyIds.filter((id) => !repliesFromPage[String(id)]);
  const repliesFromCache = await resolveReplyCommentsCached(missingReplyIds);
  const images = await fetchTopicCommentImageMap(topic.id);

  return {
    topicId: topic.id,
    topicUrl: shikimoriSiteUrl(`/forum/${topic.id}`),
    commentsCount: topic.commentsCount,
    comments: mappedComments,
    replies: { ...repliesFromCache, ...repliesFromPage },
    images,
    page,
    hasMore,
  };
}

export async function getAnimeCommentsPage(
  shikimoriId: number,
  page = 1,
): Promise<AnimeCommentsPageDto> {
  return unstable_cache(
    async () => getAnimeCommentsPageUncached(shikimoriId, page),
    ["anime-comments-page-v5", String(shikimoriId), String(page)],
    { revalidate: COMMENTS_CACHE_SECONDS, tags: [`anime-comments-${shikimoriId}`] },
  )();
}
