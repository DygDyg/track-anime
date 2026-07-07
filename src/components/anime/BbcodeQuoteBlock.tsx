"use client";

import type { ReactNode } from "react";
import { CommentScrollLink, useCommentsNavigation } from "@/components/anime/CommentsNavigationContext";
import type { ParsedQuoteAttr } from "@/lib/shikimori-bbcode";

type Props = {
  meta: ParsedQuoteAttr;
  children: ReactNode;
};

export function BbcodeQuoteBlock({ meta, children }: Props) {
  const navigation = useCommentsNavigation();
  const canScroll =
    meta.commentId != null && (navigation?.loadedCommentIds.has(meta.commentId) ?? false);

  return (
    <blockquote className="my-2 max-w-full overflow-hidden rounded-md border border-border/70 border-l-2 border-l-accent/50 bg-background/50 px-3 py-2 text-sm text-muted">
      {meta.nickname ? (
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-foreground">
          {canScroll && meta.commentId ? (
            <CommentScrollLink commentId={meta.commentId} className="hover:text-accent">
              {meta.nickname}
            </CommentScrollLink>
          ) : (
            <span>{meta.nickname}</span>
          )}
          {canScroll && meta.commentId ? (
            <CommentScrollLink commentId={meta.commentId} className="font-normal text-accent hover:underline">
              к комментарию
            </CommentScrollLink>
          ) : null}
        </div>
      ) : null}
      <div className="anime-comment-body leading-relaxed">{children}</div>
    </blockquote>
  );
}
