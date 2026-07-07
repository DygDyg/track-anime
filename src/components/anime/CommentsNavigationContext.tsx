"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { shikimoriSiteUrl } from "@/lib/shikimori/endpoints";

type CommentsNavigationContextValue = {
  loadedCommentIds: ReadonlySet<number>;
  scrollToComment: (id: number) => boolean;
};

const CommentsNavigationContext = createContext<CommentsNavigationContextValue | null>(null);

export function animeCommentDomId(id: number): string {
  return `comment-${id}`;
}

function highlightCommentElement(element: HTMLElement) {
  element.classList.add("comment-scroll-target");
  window.setTimeout(() => {
    element.classList.remove("comment-scroll-target");
  }, 2200);
}

type ProviderProps = {
  commentIds: number[];
  children: ReactNode;
};

export function CommentsNavigationProvider({ commentIds, children }: ProviderProps) {
  const loadedCommentIds = useMemo(() => new Set(commentIds), [commentIds]);

  const scrollToComment = useCallback((id: number) => {
    const element = document.getElementById(animeCommentDomId(id));
    if (!element) return false;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightCommentElement(element);
    return true;
  }, []);

  const value = useMemo(
    () => ({ loadedCommentIds, scrollToComment }),
    [loadedCommentIds, scrollToComment],
  );

  return (
    <CommentsNavigationContext.Provider value={value}>{children}</CommentsNavigationContext.Provider>
  );
}

export function useCommentsNavigation(): CommentsNavigationContextValue | null {
  return useContext(CommentsNavigationContext);
}

type CommentScrollLinkProps = {
  commentId: number;
  children: ReactNode;
  className?: string;
};

/** Ссылка на комментарий: скролл на странице или fallback на Shikimori. */
export function CommentScrollLink({ commentId, children, className = "" }: CommentScrollLinkProps) {
  const navigation = useCommentsNavigation();
  const isLoaded = navigation?.loadedCommentIds.has(commentId) ?? false;

  if (isLoaded && navigation) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => navigation.scrollToComment(commentId)}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={shikimoriSiteUrl(`/comments/${commentId}`)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
