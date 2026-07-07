/** Одновременных загрузок обложек — чтобы не забивать сеть на длинных списках. */
const MAX_CONCURRENT = 5;

/** Начинать подгрузку до появления в viewport. */
export const POSTER_LOAD_ROOT_MARGIN = "320px 0px";

const loadedUrls = new Set<string>();
const pendingUrls = new Set<string>();
const waiters = new Map<string, Array<(success: boolean) => void>>();
const queue: string[] = [];
let activeCount = 0;

function notifyWaiters(url: string, success: boolean) {
  if (success) {
    loadedUrls.add(url);
  }

  const callbacks = waiters.get(url);
  if (callbacks) {
    for (const callback of callbacks) callback(success);
    waiters.delete(url);
  }
}

function pumpQueue() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift()!;
    pendingUrls.delete(url);

    if (loadedUrls.has(url)) {
      notifyWaiters(url, true);
      continue;
    }

    activeCount += 1;
    const img = new Image();
    img.decoding = "async";

    const finish = (success: boolean) => {
      activeCount -= 1;
      notifyWaiters(url, success);
      pumpQueue();
    };

    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  }
}

/** Уже в кэше браузера — только на клиенте, не влияет на SSR. */
export function isPosterLoadCached(url: string): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(url && loadedUrls.has(url));
}

/** Ставит URL обложки в очередь; резолвится true только после успешной загрузки. */
export function enqueuePosterLoad(url: string): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  if (loadedUrls.has(url)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const callbacks = waiters.get(url) ?? [];
    callbacks.push(resolve);
    waiters.set(url, callbacks);

    if (pendingUrls.has(url)) return;

    pendingUrls.add(url);
    queue.push(url);
    pumpQueue();
  });
}

/** Только для тестов. */
export function resetPosterLoadQueueForTests(): void {
  loadedUrls.clear();
  pendingUrls.clear();
  waiters.clear();
  queue.length = 0;
  activeCount = 0;
}
