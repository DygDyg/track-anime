import "server-only";

const MAX_CONCURRENT_PUBLIC_SEARCHES = 4;

let activeSearches = 0;
const waiters: Array<() => void> = [];

async function acquireSearchSlot(): Promise<void> {
  if (activeSearches < MAX_CONCURRENT_PUBLIC_SEARCHES) {
    activeSearches += 1;
    return;
  }

  await new Promise<void>((resolve) => waiters.push(resolve));
  activeSearches += 1;
}

function releaseSearchSlot(): void {
  activeSearches -= 1;
  waiters.shift()?.();
}

/** Keeps public search below Prisma's production connection-pool limit. */
export async function withPublicSearchSlot<T>(operation: () => Promise<T>): Promise<T> {
  await acquireSearchSlot();
  try {
    return await operation();
  } finally {
    releaseSearchSlot();
  }
}
