"use client";

import { useEffect, useRef, useState } from "react";

type UseLazyInViewOptions = {
  rootMargin?: string;
  threshold?: number;
};

function isNearViewport(element: HTMLElement, rootMargin: string): boolean {
  const marginMatch = rootMargin.match(/^(-?\d+)px/);
  const margin = marginMatch ? Number(marginMatch[1]) : 0;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.top <= viewportHeight + margin && rect.bottom >= -margin;
}

export function useLazyInView(options: UseLazyInViewOptions = {}) {
  const { rootMargin = "240px 0px", threshold = 0 } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;

    const markVisible = () => {
      setInView(true);
      observer.disconnect();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          markVisible();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(element);

    if (isNearViewport(element, rootMargin)) {
      markVisible();
    }

    return () => observer.disconnect();
  }, [inView, rootMargin, threshold]);

  return { ref, inView };
}
