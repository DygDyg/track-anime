"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedDescription } from "@/components/anime/FormattedDescription";
import {
  animeCommentDomId,
  CommentsNavigationProvider,
} from "@/components/anime/CommentsNavigationContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLazyInView } from "@/hooks/useLazyInView";
import type { AnimeCommentDto, AnimeCommentsPageDto, CommentReplyDto } from "@/lib/anime-comments";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";

function formatCommentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-lg border border-border bg-background/40 p-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-dim" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-surface-dim" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-dim" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-dim" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  images,
}: {
  comment: AnimeCommentDto;
  replies: Record<string, CommentReplyDto>;
  images: Record<string, string>;
}) {
  return (
    <article
      id={animeCommentDomId(comment.id)}
      className="flex min-w-0 scroll-mt-24 gap-3 overflow-hidden rounded-lg border border-border bg-background/40 p-3 transition-shadow"
    >
      <Link
        href={comment.user.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        {comment.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.user.avatarUrl}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            {...EXTERNAL_IMG_ATTRS}
            className="h-10 w-10 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-dim text-xs font-semibold text-muted">
            {comment.user.nickname.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={comment.user.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-foreground hover:text-accent"
          >
            {comment.user.nickname}
          </Link>
          <time className="text-xs text-muted" dateTime={comment.createdAt}>
            {formatCommentDate(comment.createdAt)}
          </time>
          {comment.isOfftopic ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted">
              оффтоп
            </span>
          ) : null}
        </div>

        {comment.body ? (
          <div className="anime-comment-body">
            <FormattedDescription
              text={comment.body}
              paragraphClassName="text-sm leading-relaxed text-muted"
              replies={replies}
              images={images}
              enableEntityHover
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function AnimeCommentsSection({ shikimoriId }: { shikimoriId: number }) {
  const { ref, inView } = useLazyInView();
  const [data, setData] = useState<AnimeCommentsPageDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFetchStartedRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const response = await fetch(`/api/anime/${shikimoriId}/comments?page=${page}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить комментарии");
      }

      const next = (await response.json()) as AnimeCommentsPageDto;

      setData((current) => {
        if (!append || !current) return next;
        return {
          ...next,
          comments: [...current.comments, ...next.comments],
          replies: { ...current.replies, ...next.replies },
          images: { ...current.images, ...next.images },
        };
      });
    },
    [shikimoriId],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchPage(1, false);
    } catch {
      setError("Не удалось загрузить комментарии");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    initialFetchStartedRef.current = false;
    setData(null);
    setError(null);
    setLoading(false);
  }, [shikimoriId]);

  useEffect(() => {
    if (!inView || initialFetchStartedRef.current) return;

    initialFetchStartedRef.current = true;
    void loadInitial();
  }, [inView, loadInitial]);

  const retryInitialLoad = () => {
    void loadInitial();
  };

  const loadMore = async () => {
    if (!data?.hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      await fetchPage(data.page + 1, true);
    } catch {
      // Оставляем уже загруженные комментарии на экране.
    } finally {
      setLoadingMore(false);
    }
  };

  const loadedCommentIds = useMemo(
    () => data?.comments.map((comment) => comment.id) ?? [],
    [data?.comments],
  );

  return (
    <section
      ref={ref}
      className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
      aria-label="Комментарии Shikimori"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Комментарии</h2>
        {data?.topicUrl ? (
          <Link
            href={data.topicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted transition hover:text-accent sm:text-sm"
          >
            {data.commentsCount > 0
              ? `Все ${data.commentsCount.toLocaleString("ru-RU")} на Shikimori`
              : "Обсуждение на Shikimori"}
          </Link>
        ) : null}
      </div>

      {!inView ? (
        <p className="text-sm text-muted">Прокрутите страницу, чтобы загрузить комментарии.</p>
      ) : data && data.comments.length > 0 ? (
        <CommentsNavigationProvider commentIds={loadedCommentIds}>
          <div className="min-w-0 space-y-3 overflow-hidden">
            {data.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={data.replies ?? {}}
                images={data.images ?? {}}
              />
            ))}
          </div>

          {data.hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent disabled:opacity-60"
              >
                {loadingMore ? <LoadingSpinner size="sm" /> : null}
                Показать ещё
              </button>
            </div>
          ) : null}
        </CommentsNavigationProvider>
      ) : loading ? (
        <CommentsSkeleton />
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={retryInitialLoad}
            className="rounded-lg border border-border bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
          >
            Повторить
          </button>
        </div>
      ) : data?.topicId && data.commentsCount > 0 && data.comments.length === 0 ? (
        <p className="text-sm text-muted">
          Не удалось загрузить комментарии.{" "}
          {data.topicUrl ? (
            <Link href={data.topicUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Открыть на Shikimori
            </Link>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">Комментариев пока нет.</p>
      )}
    </section>
  );
}
