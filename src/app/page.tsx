import { HistoryNewEpisodesSection, type HistoryNewEpisodeDto } from "@/components/HistoryNewEpisodesSection";
import { ReleaseFeed } from "@/components/ReleaseFeed";
import { getSession } from "@/lib/auth/session";
import { getHistoryNewEpisodes } from "@/lib/history-new-episodes";
import { getRecentReleasesPage, serializeRelease } from "@/lib/releases";

export const revalidate = 300;

const PAGE_SIZE = 24;

export default async function HomePage() {
  const session = await getSession();
  const [{ items, hasMore, nextCursor }, historyNewEpisodes] = await Promise.all([
    getRecentReleasesPage(PAGE_SIZE),
    session ? getHistoryNewEpisodes(session.user.id) : Promise.resolve([]),
  ]);

  const initialItems = items.map(serializeRelease);
  const historyItems: HistoryNewEpisodeDto[] = historyNewEpisodes.map((item) => ({
    ...serializeRelease(item),
    watchedSeasonNumber: item.watchedSeasonNumber,
    watchedEpisodeNumber: item.watchedEpisodeNumber,
  }));
  const historyIds = historyItems.map((item) => item.id);

  return (
    <div className="py-5 sm:py-8">
      {historyItems.length > 0 ? <HistoryNewEpisodesSection items={historyItems} /> : null}

      {initialItems.length === 0 && historyItems.length === 0 ? (
        <div className="mx-3 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center sm:mx-6 sm:p-10 lg:mx-8">
          <p className="text-muted">Пока нет данных. Запустите синхронизацию:</p>
          <code className="mt-3 inline-block rounded bg-background px-3 py-1 text-sm text-accent">
            npm run kodik:sync
          </code>
        </div>
      ) : (
        <ReleaseFeed
          initialItems={initialItems}
          initialHasMore={hasMore}
          initialNextCursor={nextCursor}
          pageSize={PAGE_SIZE}
          excludeIds={historyIds}
        />
      )}
    </div>
  );
}
