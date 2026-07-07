"use client";

import Link from "next/link";
import { parseShikimoriBbcode } from "@/components/anime/FormattedDescription";
import { CommentScrollLink, useCommentsNavigation } from "@/components/anime/CommentsNavigationContext";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import type { CommentReplyDto } from "@/lib/anime-comments";

function formatReplyDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

type Props = {
  reply: CommentReplyDto;
  replies?: Record<string, CommentReplyDto>;
  images?: Record<string, string>;
  enableEntityHover?: boolean;
};

export function BbcodeReplyQuote({ reply, replies, images, enableEntityHover = true }: Props) {
  const navigation = useCommentsNavigation();
  const canScrollToSource = navigation?.loadedCommentIds.has(reply.id) ?? false;

  return (
    <blockquote className="mb-1.5 max-w-full overflow-hidden rounded-md border border-border/70 border-l-2 border-l-accent/50 bg-background/50 px-2.5 py-2 text-xs text-muted">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted/80" aria-hidden>
          ↩
        </span>
        <Link
          href={reply.user.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-accent"
        >
          {reply.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reply.user.avatarUrl}
              alt=""
              width={16}
              height={16}
              loading="lazy"
              decoding="async"
              {...EXTERNAL_IMG_ATTRS}
              className="h-4 w-4 rounded-full border border-border object-cover"
            />
          ) : null}
          {reply.user.nickname}
        </Link>
        {reply.createdAt ? (
          <time className="text-[11px] text-muted/80" dateTime={reply.createdAt}>
            {formatReplyDate(reply.createdAt)}
          </time>
        ) : null}
        {canScrollToSource ? (
          <CommentScrollLink
            commentId={reply.id}
            className="text-[11px] text-accent hover:underline"
          >
            к комментарию
          </CommentScrollLink>
        ) : null}
      </div>
      {reply.body ? (
        <div className="anime-comment-body text-xs leading-relaxed text-muted">
          {parseShikimoriBbcode(reply.body, {
            replies,
            images,
            enableEntityHover,
            nested: true,
          })}
        </div>
      ) : null}
    </blockquote>
  );
}

type BbcodeReplyFallbackProps = {
  id: string;
};

export function BbcodeReplyFallback({ id }: BbcodeReplyFallbackProps) {
  const commentId = Number(id);

  return (
    <span className="mb-1.5 block rounded-md border border-border/70 bg-background/50 px-2 py-1 text-xs text-muted">
      ↩{" "}
      {Number.isFinite(commentId) && commentId > 0 ? (
        <CommentScrollLink commentId={commentId} className="text-accent hover:underline">
          комментарий #{id}
        </CommentScrollLink>
      ) : (
        <span>комментарий #{id}</span>
      )}
    </span>
  );
}
