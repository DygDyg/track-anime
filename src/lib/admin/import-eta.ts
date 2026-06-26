const DEFAULT_SECONDS_PER_ITEM = 2.5;

export function formatDurationRu(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} сек`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
}

type ImportJobEtaInput = {
  phase: string;
  status: string;
  processed: number;
  total: number | null;
  nextPageUrl: string | null;
  pendingEpisodes: number;
  episodesLoaded: number;
  sessionProcessed: number;
  sessionTotal: number | null;
  sessionStartedAt: Date | null;
  sessionBaselineProcessed: number;
  lastItemsPerSecond: number | null;
  isRunning: boolean;
};

function itemsPerSecond(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

function rateFromSession(
  done: number,
  startedAt: Date | null,
  now = Date.now(),
): number | null {
  if (done <= 0 || !startedAt) return null;
  const elapsed = (now - startedAt.getTime()) / 1000;
  if (elapsed < 5) return null;
  return done / elapsed;
}

export function isCatalogComplete(job: {
  phase: string;
  status: string;
  processed: number;
  total: number | null;
  nextPageUrl: string | null;
}): boolean {
  if (job.status === "catalog_done" || job.status === "done") return true;
  if (job.phase === "episodes" || job.phase === "sync") return true;
  if (!job.nextPageUrl && job.processed > 0) {
    if (job.total != null && job.processed >= job.total) return true;
  }
  return false;
}

function estimateCatalogRemainingSeconds(job: ImportJobEtaInput, now = Date.now()): number | null {
  if (isCatalogComplete(job)) return 0;
  const total = job.total;
  if (total == null || total <= job.processed) return null;

  const remaining = total - job.processed;
  const doneInSession = Math.max(0, job.processed - job.sessionBaselineProcessed);
  const rate =
    (job.isRunning && job.phase === "catalog"
      ? rateFromSession(doneInSession, job.sessionStartedAt, now)
      : null) ??
    itemsPerSecond(job.lastItemsPerSecond) ??
    1 / DEFAULT_SECONDS_PER_ITEM;

  return Math.ceil(remaining / rate);
}

function estimateEpisodesRemainingSeconds(job: ImportJobEtaInput, now = Date.now()): number | null {
  if (job.pendingEpisodes <= 0) return 0;

  const rate =
    (job.isRunning && job.phase === "episodes"
      ? rateFromSession(job.sessionProcessed, job.sessionStartedAt, now)
      : null) ??
    itemsPerSecond(job.lastItemsPerSecond) ??
    1 / DEFAULT_SECONDS_PER_ITEM;

  return Math.ceil(job.pendingEpisodes / rate);
}

function estimateSyncRemainingSeconds(job: ImportJobEtaInput, now = Date.now()): number | null {
  if (!job.isRunning || job.phase !== "sync") return null;
  if (job.sessionTotal == null || job.sessionTotal <= job.sessionProcessed) return 0;

  const remaining = job.sessionTotal - job.sessionProcessed;
  const rate = rateFromSession(job.sessionProcessed, job.sessionStartedAt, now);
  if (!rate) return null;

  return Math.ceil(remaining / rate);
}

export type ImportEta = {
  remainingSeconds: number | null;
  remainingLabel: string | null;
  isEstimate: boolean;
};

export function estimateImportRemaining(job: ImportJobEtaInput): ImportEta {
  if (job.isRunning && job.phase === "sync") {
    const remainingSeconds = estimateSyncRemainingSeconds(job);
    if (remainingSeconds == null) {
      return { remainingSeconds: null, remainingLabel: "Расчёт…", isEstimate: true };
    }
    return {
      remainingSeconds,
      remainingLabel: formatDurationRu(remainingSeconds),
      isEstimate: job.sessionProcessed < 3,
    };
  }

  const catalogSeconds = estimateCatalogRemainingSeconds(job);
  const episodesSeconds = estimateEpisodesRemainingSeconds(job);

  if (catalogSeconds == null && episodesSeconds == null) {
    return { remainingSeconds: null, remainingLabel: null, isEstimate: false };
  }

  const remainingSeconds = (catalogSeconds ?? 0) + (episodesSeconds ?? 0);
  if (remainingSeconds <= 0) {
    return { remainingSeconds: 0, remainingLabel: "Завершено", isEstimate: false };
  }

  const isEstimate =
    !job.isRunning ||
    (job.phase === "catalog" && job.processed - job.sessionBaselineProcessed < 100) ||
    (job.phase === "episodes" && job.sessionProcessed < 3) ||
    job.lastItemsPerSecond == null;

  return {
    remainingSeconds,
    remainingLabel: formatDurationRu(remainingSeconds),
    isEstimate,
  };
}
