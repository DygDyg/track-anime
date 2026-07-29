"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { emitCompanionReaction, emitCompanionSituation } from "@/lib/companion/companion-bus";

const NavigationPendingContext = createContext<(pending: boolean) => void>(() => {});

/** Keep jumpRope visible at least this long (pathname often flips before content is ready). */
const MIN_JUMP_ROPE_MS = 1000;
/** Extra hold after pathname change while RSC/stream settles. */
const POST_PATH_SETTLE_MS = 400;

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
  const navInFlightRef = useRef(false);
  const jumpRopeStartedAtRef = useRef(0);

  useEffect(() => {
    if (!navInFlightRef.current) {
      setPending(false);
      emitCompanionSituation(pathname, { force: true });
      return;
    }

    navInFlightRef.current = false;
    const elapsed = Date.now() - jumpRopeStartedAtRef.current;
    const delay = Math.max(POST_PATH_SETTLE_MS, MIN_JUMP_ROPE_MS - elapsed);
    const timer = window.setTimeout(() => {
      setPending(false);
      emitCompanionSituation(pathname, { force: true });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <NavigationPendingContext.Provider
      value={(next) => {
        setPending(next);
        if (next) {
          navInFlightRef.current = true;
          jumpRopeStartedAtRef.current = Date.now();
          emitCompanionReaction("jumpRopeLoading", { force: true });
        }
      }}
    >
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
