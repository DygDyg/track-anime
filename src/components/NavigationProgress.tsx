"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const NavigationPendingContext = createContext<(pending: boolean) => void>(() => {});

function normalizePath(path: string): string {
  const base = path.split("#")[0]?.split("?")[0] ?? path;
  return base === "" ? "/" : base;
}

export function shouldStartNavigation(href: string, pathname: string, searchParams?: string): boolean {
  const targetPath = normalizePath(href);
  const currentPath = normalizePath(pathname);
  if (targetPath !== currentPath) return true;

  const targetQuery = href.includes("?") ? href.split("?")[1]?.split("#")[0] ?? "" : "";
  const currentQuery = searchParams ?? "";
  return targetQuery !== currentQuery;
}

export function useNavigationPendingSetter() {
  return useContext(NavigationPendingContext);
}

export function useNavigationClick(href: string, onClick?: (event: MouseEvent<HTMLAnchorElement>) => void) {
  const pathname = usePathname();
  const setPending = useNavigationPendingSetter();

  return (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (shouldStartNavigation(href, pathname)) {
      setPending(true);
    }
  };
}

export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  return (
    <NavigationPendingContext.Provider value={setPending}>
      {pending ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden supports-[padding:max(0px)]:top-[env(safe-area-inset-top)]"
          aria-hidden
        >
          <div className="navigation-progress-bar h-full bg-accent shadow-[0_0_8px_rgba(108,140,255,0.65)]" />
        </div>
      ) : null}
      {children}
    </NavigationPendingContext.Provider>
  );
}
