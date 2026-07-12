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

export function shouldIgnoreTvNavigation(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  if (event.target instanceof HTMLElement && isInsidePlayerKeyboardScope(event.target)) return true;
  if (isTextEntryTarget(event.target)) return true;

  const active = document.activeElement;
  if (active instanceof HTMLIFrameElement) return true;
  if (
    active instanceof HTMLElement &&
    (isInsideModal(active) || isInsidePlayerKeyboardScope(active))
  ) {
    return true;
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

export function getTvFocusableElements(root: ParentNode = document): HTMLElement[] {
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

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function findTvFocusNeighbor(
  current: HTMLElement,
  direction: TvNavDirection,
  root: ParentNode = document,
): HTMLElement | null {
  const candidates = getTvFocusableElements(root).filter((el) => el !== current);
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
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

export function getInitialTvFocusTarget(root: ParentNode = document): HTMLElement | null {
  const main = root instanceof Document ? root.querySelector("main") : null;
  const scope = main ?? root;
  return getTvFocusableElements(scope)[0] ?? null;
}

export function markTvNavigationActive(): void {
  document.documentElement.dataset.tvNav = "true";
}

export function isTvBackKey(key: string): boolean {
  return key === "Back" || key === "BrowserBack" || key === "XF86Back";
}

export function handleTvBackNavigation(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isInsideModal(active)) {
    return false;
  }

  if (window.history.length > 1) {
    window.history.back();
    return true;
  }

  return false;
}
