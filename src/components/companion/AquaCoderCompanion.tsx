"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { AquaCoderCanvas } from "@/lib/companion/AquaCoderCanvas";
import {
  emitCompanionReaction,
  emitCompanionSituation,
  getCompanionSituation,
  subscribeCompanionReactions,
  type CompanionAnimation,
} from "@/lib/companion/companion-bus";
import { isTvNavigationSessionActive } from "@/lib/tv-navigation";
import {
  COMPANION_FRAME_WIDTH,
  normalizeCompanionScale,
  resolveCompanionDisplayScale,
} from "@/lib/site-settings";
import { CompanionNotificationBubbles } from "@/components/companion/CompanionNotificationBubble";
import {
  emitTestDigestToast,
  emitTestNotificationToast,
} from "@/lib/notifications/toast-ui";

type CompanionPermissionPromptState = {
  open: boolean;
  denied: boolean;
  requesting: boolean;
};

const COMPANION_ANIMATIONS: { id: CompanionAnimation; label: string }[] = [
  { id: "idle", label: "idle" },
  { id: "work", label: "work" },
  { id: "runRight", label: "runRight" },
  { id: "runLeft", label: "runLeft" },
  { id: "wave", label: "wave" },
  { id: "jump", label: "jump" },
  { id: "error", label: "error" },
  { id: "waiting", label: "waiting" },
  { id: "review", label: "review" },
  { id: "lying", label: "lying" },
  { id: "sleeping", label: "sleeping" },
  { id: "searching", label: "searching" },
  { id: "reading", label: "reading" },
  { id: "celebrate", label: "celebrate" },
  { id: "calendar", label: "calendar" },
  { id: "history", label: "history" },
  { id: "favorites", label: "favorites" },
  { id: "appear", label: "appear" },
  { id: "leave", label: "leave" },
  { id: "jumpRopeLoading", label: "jumpRopeLoading" },
  { id: "sitting", label: "sitting" },
  { id: "sittingPlay", label: "sittingPlay" },
  { id: "sittingPause", label: "sittingPause" },
];

const DESKTOP_MQ = "(min-width: 768px)";
const IDLE_LIE_MS = 90_000;
const IDLE_SLEEP_MS = 180_000;
const REACTION_COOLDOWN_MS = 350;

export function AquaCoderCompanion() {
  const { settings, settingsOpen } = useSiteSettings();
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<AquaCoderCanvas | null>(null);
  const menuOpenRef = useRef(false);
  const bootstrappingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const lastReactionAtRef = useRef(0);
  const lastAnimationRef = useRef<string>("idle");
  const prevSettingsOpenRef = useRef(settingsOpen);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState<CompanionAnimation>("idle");
  const enabled = settings.companionEnabled;
  const companionScale = normalizeCompanionScale(settings.companionScale);
  const displayScale = resolveCompanionDisplayScale(companionScale);
  const companionStatic = settings.companionStaticAnimations === true;
  const [tvNavActive, setTvNavActive] = useState(false);
  const visible = enabled && desktop && !tvNavActive;

  useEffect(() => {
    const sync = () => setTvNavActive(isTvNavigationSessionActive());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-tv-nav", "data-tv-nav-enabled"],
    });
    return () => observer.disconnect();
  }, []);
  const isAdmin = Boolean(user?.isAdmin);

  const COMPANION_PERMISSION_EVENT = "ta:companion-permission-prompt";
  const COMPANION_PERMISSION_ACTION_EVENT = "ta:companion-permission-prompt-action";

  const [permissionPrompt, setPermissionPrompt] = useState<CompanionPermissionPromptState>({
    open: false,
    denied: false,
    requesting: false,
  });

  menuOpenRef.current = menuOpen;
  pathnameRef.current = pathname;

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-aqua-companion", visible);
    if (visible) {
      document.documentElement.style.setProperty(
        "--aqua-companion-width",
        `${Math.round(COMPANION_FRAME_WIDTH * displayScale)}px`,
      );
    } else {
      document.documentElement.style.removeProperty("--aqua-companion-width");
    }
    return () => {
      document.documentElement.classList.remove("has-aqua-companion");
      document.documentElement.style.removeProperty("--aqua-companion-width");
    };
  }, [visible, displayScale]);

  const playAnimation = (name: CompanionAnimation, options?: { force?: boolean }) => {
    const player = playerRef.current;
    if (!player) return;
    if (!options?.force && name === lastAnimationRef.current) return;
    if (!options?.force && Date.now() - lastReactionAtRef.current < REACTION_COOLDOWN_MS) return;
    lastReactionAtRef.current = Date.now();
    lastAnimationRef.current = name;
    // Guard against "Cannot update a component while rendering a different component".
    // emitCompanionReaction might be triggered synchronously from another component's render.
    // Defer state update to the end of current JS stack.
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => setCurrentAnimation(name));
    } else {
      // Fallback for environments without queueMicrotask.
      setTimeout(() => setCurrentAnimation(name), 0);
    }
    void player.play(name).catch(() => undefined);
  };

  const restoreSituation = (options?: { force?: boolean }) => {
    playAnimation(getCompanionSituation(pathnameRef.current), { force: options?.force ?? true });
  };

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    bootstrappingRef.current = true;
    const player = new AquaCoderCanvas(canvas, {
      scale: displayScale,
      onError: (error) => {
        console.warn("[aqua-coder]", error.message);
      },
      onAnimationComplete: (event) => {
        if (event.animation === "appear") {
          event.cancelAutoReturn = true;
          bootstrappingRef.current = false;
          emitCompanionSituation(pathnameRef.current, { force: true });
          return;
        }
        lastAnimationRef.current = event.returnTo;
        setCurrentAnimation(event.returnTo as CompanionAnimation);
      },
    });
    player.setStaticMode(companionStatic);
    playerRef.current = player;
    lastAnimationRef.current = "appear";
    setCurrentAnimation("appear");
    void player.start("appear").catch(() => {
      bootstrappingRef.current = false;
    });

    return () => {
      bootstrappingRef.current = false;
      player.destroy();
      playerRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    try {
      playerRef.current?.setScale(displayScale);
    } catch {
      /* ignore */
    }
  }, [visible, displayScale]);

  useEffect(() => {
    if (!visible) return;

    const applyStaticMode = () => {
      const playing = document.documentElement.hasAttribute("data-player-playing");
      // Freeze companion RAF while video plays — canvas + CSS blur compete with Kodik decode.
      playerRef.current?.setStaticMode(companionStatic || playing);
    };
    applyStaticMode();

    const observer = new MutationObserver(applyStaticMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-player-playing"],
    });
    return () => {
      observer.disconnect();
      playerRef.current?.setStaticMode(companionStatic);
    };
  }, [visible, companionStatic]);

  useEffect(() => {
    if (!visible) return;
    return subscribeCompanionReactions((animation, options) => {
      if (menuOpenRef.current) return;
      // Ignore tab/situation cues until appear finishes — prevents a second character.
      if (bootstrappingRef.current) return;
      playAnimation(animation, options);
    });
  }, [visible]);

  // Settings modal temporarily overrides tab situation
  useEffect(() => {
    if (!visible) return;
    const wasOpen = prevSettingsOpenRef.current;
    prevSettingsOpenRef.current = settingsOpen;
    if (settingsOpen) {
      // Debug menu uses a fullscreen hit-target above the modal (z-110); close it.
      setMenuOpen(false);
      emitCompanionReaction("review", { force: true });
      return;
    }
    if (wasOpen) {
      emitCompanionSituation(pathname, { force: true });
    }
  }, [settingsOpen, visible, pathname]);

  // Login / logout — ignore session restore (null → user after authLoading)
  useEffect(() => {
    if (!visible || authLoading) return;
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    if (prev === undefined) {
      prevUserIdRef.current = next;
      return;
    }
    prevUserIdRef.current = next;
    if (prev == null && next) {
      emitCompanionReaction("celebrate", { force: true });
      return;
    }
    if (prev && next == null) {
      emitCompanionReaction("wave", { force: true });
    }
  }, [user?.id, visible, authLoading]);

  // Inactivity → lying / sleeping; wake restores tab situation
  useEffect(() => {
    if (!visible || menuOpen) return;

    let lieTimer: number | undefined;
    let sleepTimer: number | undefined;

    const clearIdleTimers = () => {
      if (lieTimer !== undefined) window.clearTimeout(lieTimer);
      if (sleepTimer !== undefined) window.clearTimeout(sleepTimer);
      lieTimer = undefined;
      sleepTimer = undefined;
    };

    const armIdleTimers = () => {
      clearIdleTimers();
      lieTimer = window.setTimeout(() => {
        if (menuOpenRef.current) return;
        emitCompanionReaction("lying");
      }, IDLE_LIE_MS);
      sleepTimer = window.setTimeout(() => {
        if (menuOpenRef.current) return;
        emitCompanionReaction("sleeping");
      }, IDLE_SLEEP_MS);
    };

    const onActivity = () => {
      if (
        lastAnimationRef.current === "lying" ||
        lastAnimationRef.current === "sleeping"
      ) {
        emitCompanionSituation(pathnameRef.current, { force: true });
      }
      armIdleTimers();
    };

    armIdleTimers();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    return () => {
      clearIdleTimers();
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, [visible, menuOpen]);

  // Listen for notification-permission prompt (rendered as companion bubble).
  useEffect(() => {
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<CompanionPermissionPromptState>).detail;
      if (!detail) return;
      setPermissionPrompt({
        open: Boolean(detail.open),
        denied: Boolean(detail.denied),
        requesting: Boolean(detail.requesting),
      });
    };

    window.addEventListener(COMPANION_PERMISSION_EVENT, onPrompt as EventListener);
    return () => window.removeEventListener(COMPANION_PERMISSION_EVENT, onPrompt as EventListener);
  }, [COMPANION_PERMISSION_EVENT]);

  if (!visible) return null;

  const setMenuOpenSafe = (open: boolean) => {
    const wasOpen = menuOpenRef.current;
    setMenuOpen(open);
    if (wasOpen && !open) {
      restoreSituation({ force: true });
    }
  };

  return (
    <div
      className={[
        "aqua-coder-companion pointer-events-none fixed hidden flex-col items-end gap-2 md:flex",
        settingsOpen ? "z-[110]" : "z-40",
      ].join(" ")}
    >
      {isAdmin && !settingsOpen ? (
        <div className="pointer-events-auto relative">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={`Отладка анимаций · сейчас: ${currentAnimation}`}
            onClick={() => setMenuOpenSafe(!menuOpen)}
            className="rounded-lg border border-border/90 bg-card/90 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-lg shadow-black/30 backdrop-blur-md backdrop-saturate-150 hover:border-accent/50 hover:bg-accent/15 hover:text-accent"
          >
            {currentAnimation}
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню анимаций"
                className="fixed inset-0 z-0 cursor-default bg-transparent"
                onClick={() => setMenuOpenSafe(false)}
              />
              <ul
                role="menu"
                className="absolute bottom-full right-0 z-10 mb-2 max-h-[min(24rem,50vh)] w-44 overflow-y-auto rounded-xl border border-border/90 bg-card/95 py-1 shadow-lg shadow-black/40 backdrop-blur-md backdrop-saturate-150"
              >
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent/15"
                    onClick={() => {
                      emitTestNotificationToast();
                      setMenuOpenSafe(false);
                    }}
                  >
                    Тест облачка
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent/15"
                    onClick={() => {
                      emitTestDigestToast();
                      setMenuOpenSafe(false);
                    }}
                  >
                    Тест «сегодня»
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent/15"
                    onClick={() => {
                      emitTestDigestToast(0);
                      setMenuOpenSafe(false);
                    }}
                  >
                    Тест «сегодня» (0)
                  </button>
                </li>
                <li role="separator" className="my-1 border-t border-border/70" />
                {COMPANION_ANIMATIONS.map((animation) => (
                  <li key={animation.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={[
                        "block w-full px-3 py-1.5 text-left text-xs hover:bg-accent/15 hover:text-accent",
                        currentAnimation === animation.id
                          ? "bg-accent/15 font-medium text-accent"
                          : "text-foreground",
                      ].join(" ")}
                      onMouseEnter={() => playAnimation(animation.id, { force: true })}
                      onFocus={() => playAnimation(animation.id, { force: true })}
                      onClick={() => playAnimation(animation.id, { force: true })}
                    >
                      {animation.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {permissionPrompt.open ? (
        <div
          className="companion-speech-bubble pointer-events-auto relative mb-1 w-[min(22rem,calc(var(--aqua-companion-width,12rem)+12rem))] rounded-2xl border border-white/80 bg-card/95 px-3.5 py-2.5 shadow-lg shadow-black/30 backdrop-blur-md backdrop-saturate-150"
          role="dialog"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-foreground">Уведомления о новых сериях</p>
          <p className="mt-1 text-xs text-muted">
            {permissionPrompt.denied
              ? "Браузер заблокировал уведомления. Разрешите их в настройках сайта в адресной строке."
              : "Разрешите уведомления — подключится push для фона и PWA (нужна production-сборка)."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!permissionPrompt.denied ? (
              <button
                type="button"
                disabled={permissionPrompt.requesting}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(COMPANION_PERMISSION_ACTION_EVENT, { detail: { action: "allow" } }),
                  )
                }
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {permissionPrompt.requesting ? "Запрос…" : "Разрешить"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(COMPANION_PERMISSION_ACTION_EVENT, { detail: { action: "hide" } }),
                )
              }
              className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Скрыть
            </button>
          </div>
        </div>
      ) : null}
      <CompanionNotificationBubbles />
      <canvas
        ref={canvasRef}
        aria-hidden={!isAdmin}
        aria-label="Aqua Coder"
        className="pointer-events-none select-none"
      />
    </div>
  );
}
