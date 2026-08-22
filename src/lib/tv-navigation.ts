export type TvNavDirection = "left" | "right" | "up" | "down";

const TV_FOCUS_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[data-tv-focus]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TV_CHROME_SELECTOR = "header.site-header, [data-tv-chrome]";
const PAGE_TOP_SCROLL_PX = 72;

type FocusableCacheEntry = {
  root: ParentNode;
  elements: HTMLElement[];
};

let focusableCache: FocusableCacheEntry | null = null;
let focusableCacheDirty = true;
let cacheWatchStarted = false;
let cacheWatchCleanup: (() => void) | null = null;

export function invalidateTvFocusableCache(): void {
  focusableCacheDirty = true;
  focusableCache = null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isInsideModal(element: HTMLElement): boolean {
  return Boolean(element.closest('[role="dialog"][aria-modal="true"]'));
}

function isInsidePlayerKeyboardScope(element: HTMLElement): boolean {
  return Boolean(element.closest("[data-player-keyboard-scope]"));
}

/** Focusable controls inside the player — TV D-pad should move between them. */
export function isPlayerControlFocusTarget(element: HTMLElement): boolean {
  const tag = element.tagName;
  if (tag === "BUTTON" || tag === "SELECT" || tag === "A") return true;
  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type;
    return type === "button" || type === "checkbox" || type === "radio" || type === "range";
  }
  if (element.hasAttribute("data-tv-focus")) return true;
  return false;
}

/** Player surface previously used for seek-key hybrid; keep helper for attrs if reintroduced. */
export function isPlayerSeekKeyTarget(element: HTMLElement): boolean {
  return element.hasAttribute("data-tv-player-seek-keys");
}

export function isTvChromeElement(element: HTMLElement): boolean {
  return Boolean(element.closest(TV_CHROME_SELECTOR));
}

export function isTvPageNearTop(thresholdPx = PAGE_TOP_SCROLL_PX): boolean {
  if (typeof window === "undefined") return true;
  return window.scrollY <= thresholdPx;
}

export function shouldIgnoreTvNavigation(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;

  // While search is editing, arrow keys should leave the field (provider exits editing).
  const isArrow =
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight";
  if (isTvSearchEditing() && isArrow) {
    return false;
  }

  const active = document.activeElement;
  const scopeTarget =
    event.target instanceof HTMLElement
      ? event.target
      : active instanceof HTMLElement
        ? active
        : null;

  // Seek surface owns D-pad arrows (seek / jump to episodes or bar).
  if (isArrow && scopeTarget && isInsidePlayerKeyboardScope(scopeTarget) && isPlayerSeekKeyTarget(scopeTarget)) {
    return true;
  }

  if (event.target instanceof HTMLElement && isInsidePlayerKeyboardScope(event.target)) {
    if (!isPlayerControlFocusTarget(event.target)) return true;
  } else if (isTextEntryTarget(event.target)) {
    return true;
  }

  if (active instanceof HTMLIFrameElement) return true;
  if (active instanceof HTMLElement && isInsideModal(active)) {
    return true;
  }
  if (active instanceof HTMLElement && isInsidePlayerKeyboardScope(active)) {
    if (!isPlayerControlFocusTarget(active)) return true;
  }

  return false;
}

function isVisibleFocusTarget(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  if (element.hasAttribute("disabled")) return false;
  if (element.getAttribute("tabindex") === "-1" && !element.hasAttribute("data-tv-focus")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isNestedInTvCard(element: HTMLElement): boolean {
  const card = element.closest("[data-tv-card]");
  return Boolean(card && card !== element);
}

function collectTvFocusableElements(root: ParentNode): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];

  for (const element of root.querySelectorAll(TV_FOCUS_SELECTOR)) {
    if (!(element instanceof HTMLElement)) continue;
    if (!isVisibleFocusTarget(element)) continue;
    if (isNestedInTvCard(element)) continue;
    if (seen.has(element)) continue;
    seen.add(element);
    result.push(element);
  }

  return result.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 4) return ra.top - rb.top;
    return ra.left - rb.left;
  });
}

export function getTvFocusableElements(root: ParentNode = document): HTMLElement[] {
  if (!focusableCacheDirty && focusableCache && focusableCache.root === root) {
    return focusableCache.elements;
  }

  const elements = collectTvFocusableElements(root);
  focusableCache = { root, elements };
  focusableCacheDirty = false;
  return elements;
}

/** Keep focusable list fresh while TV nav is active. */
export function startTvFocusableCacheWatch(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (cacheWatchStarted && cacheWatchCleanup) return cacheWatchCleanup;

  const markDirty = () => invalidateTvFocusableCache();
  const observer = new MutationObserver(markDirty);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "disabled", "tabindex", "aria-hidden", "data-tv-focus", "data-tv-card"],
  });

  window.addEventListener("resize", markDirty);
  window.addEventListener("scroll", markDirty, true);

  cacheWatchStarted = true;
  cacheWatchCleanup = () => {
    observer.disconnect();
    window.removeEventListener("resize", markDirty);
    window.removeEventListener("scroll", markDirty, true);
    cacheWatchStarted = false;
    cacheWatchCleanup = null;
    invalidateTvFocusableCache();
  };

  return cacheWatchCleanup;
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function findTvFocusNeighbor(
  current: HTMLElement,
  direction: TvNavDirection,
  root: ParentNode = document,
  focusables?: HTMLElement[],
): HTMLElement | null {
  const candidates = (focusables ?? getTvFocusableElements(root)).filter((el) => el !== current);
  if (candidates.length === 0) return null;

  const currentRect = current.getBoundingClientRect();
  const currentCenter = center(currentRect);

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const candidateCenter = center(rect);
    const dx = candidateCenter.x - currentCenter.x;
    const dy = candidateCenter.y - currentCenter.y;

    if (direction === "left" && dx >= -8) continue;
    if (direction === "right" && dx <= 8) continue;
    if (direction === "up" && dy >= -8) continue;
    if (direction === "down" && dy <= 8) continue;

    const primary =
      direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const secondary =
      direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.5;

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function focusTvElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}

export function getInitialTvFocusTarget(
  root: ParentNode = document,
  focusables?: HTMLElement[],
): HTMLElement | null {
  if (focusables) {
    const main = root instanceof Document ? root.querySelector("main") : null;
    if (main) {
      const inMain = focusables.find((el) => main.contains(el));
      if (inMain) return inMain;
    }
    return focusables[0] ?? null;
  }

  const main = root instanceof Document ? root.querySelector("main") : null;
  const scope = main ?? root;
  return getTvFocusableElements(scope)[0] ?? null;
}

export function getTvChromeFocusTarget(focusables?: HTMLElement[]): HTMLElement | null {
  const list = focusables ?? getTvFocusableElements();
  return list.find((el) => isTvChromeElement(el)) ?? null;
}

export function isTvNavigationEnabled(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.tvNavEnabled !== "false";
}

/** Session flag: TV D-pad mode is on for this page (requires setting enabled). */
export function isTvNavigationSessionActive(): boolean {
  if (typeof document === "undefined") return false;
  return isTvNavigationEnabled() && document.documentElement.dataset.tvNav === "true";
}

export function markTvNavigationActive(): void {
  if (!isTvNavigationEnabled()) {
    delete document.documentElement.dataset.tvNav;
    return;
  }
  document.documentElement.dataset.tvNav = "true";
}

export function isTvBackKey(key: string): boolean {
  return key === "Back" || key === "BrowserBack" || key === "XF86Back";
}

export function isTvSearchEditing(): boolean {
  return document.documentElement.dataset.tvSearchEditing === "true";
}

export function setTvSearchEditing(editing: boolean): void {
  if (editing) {
    document.documentElement.dataset.tvSearchEditing = "true";
  } else {
    delete document.documentElement.dataset.tvSearchEditing;
  }
  invalidateTvFocusableCache();
}

type TvSearchExitHandler = () => boolean;
let tvSearchExitHandler: TvSearchExitHandler | null = null;

export function registerTvSearchEditingExit(handler: TvSearchExitHandler | null): void {
  tvSearchExitHandler = handler;
}

export function exitTvSearchEditingIfNeeded(): boolean {
  if (!isTvSearchEditing()) return false;
  return tvSearchExitHandler?.() ?? false;
}

export function handleTvBackNavigation(): boolean {
  if (closeOpenTvModal()) {
    return true;
  }

  if (isTvSearchEditing() && tvSearchExitHandler?.()) {
    return true;
  }

  if (typeof document !== "undefined" && document.fullscreenElement) {
    void document.exitFullscreen();
    return true;
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement && !isTvChromeElement(active)) {
    const chrome = getTvChromeFocusTarget();
    if (chrome) {
      window.scrollTo({ top: 0, behavior: "auto" });
      focusTvElement(chrome);
      return true;
    }
  }

  if (window.history.length > 1) {
    window.history.back();
    return true;
  }

  return false;
}

type TvModalCloseHandler = () => boolean;
let tvModalCloseHandler: TvModalCloseHandler | null = null;

export function registerTvModalClose(handler: TvModalCloseHandler | null): void {
  tvModalCloseHandler = handler;
}

export function closeOpenTvModal(): boolean {
  if (tvModalCloseHandler?.()) {
    return true;
  }

  const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!modal) return false;

  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  return true;
}

/** Called from Android WebView shell before Activity finishes / history.back. */
export function installAndroidBackBridge(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const w = window as Window & { __taAndroidBack?: () => boolean };
  const handler = () => handleTvBackNavigation();
  w.__taAndroidBack = handler;
  return () => {
    if (w.__taAndroidBack === handler) {
      delete w.__taAndroidBack;
    }
  };
}

/** Scroll page up when Up is pressed mid-page (instead of jumping to header). */
export function scrollTvPageUp(): void {
  const step = Math.min(Math.round(window.innerHeight * 0.4), 360);
  window.scrollBy({ top: -step, behavior: "auto" });
  invalidateTvFocusableCache();
}
