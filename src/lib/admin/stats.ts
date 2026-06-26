import { prisma } from "@/lib/prisma";
import { getReleaseStats } from "@/lib/releases";
import { estimateImportRemaining } from "@/lib/admin/import-eta";
import { getAdminStorageStats, type AdminStorageStats } from "@/lib/admin/storage-stats";
import { getSiteBuildInfo, type SiteBuildInfo } from "@/lib/admin/build-info";

export type { AdminStorageStats } from "@/lib/admin/storage-stats";
export type { SiteBuildInfo } from "@/lib/admin/build-info";

/** Сессия без обновлений дольше этого считается зависшей (обрыв HTTP, рестарт). */
const STALE_RUNNING_MS = 5 * 60 * 1000;

export type ImportJobDto = {
  phase: string;
  status: string;
  processed: number;
  total: number | null;
  materialTotal: number;
  pendingEpisodes: number;
  episodesLoaded: number;
  progressPercent: number | null;
  currentItem: string | null;
  sessionProcessed: number;
  sessionSkipped: number;
  sessionTotal: number | null;
  lastError: string | null;
  updatedAt: string;
  isRunning: boolean;
  remainingSeconds: number | null;
  remainingLabel: string | null;
  remainingIsEstimate: boolean;
};

export type AdminDashboardStats = {
  releases: number;
  materials: number;
  episodes: number;
  users: number;
  activeSessions: number;
  releasesLast24h: number;
  pendingEpisodes: number;
  materialsWithoutShikimori: number;
  importJob: ImportJobDto | null;
  storage: AdminStorageStats;
  build: SiteBuildInfo;
};

function buildImportJobDto(
  job: {
    phase: string;
    status: string;
    processed: number;
    total: number | null;
    nextPageUrl: string | null;
    currentItem: string | null;
    sessionProcessed: number;
    sessionSkipped: number;
    sessionTotal: number | null;
    sessionStartedAt: Date | null;
    sessionBaselineProcessed: number;
    lastItemsPerSecond: number | null;
    lastError: string | null;
    updatedAt: Date;
  },
  pendingEpisodes: number,
  episodesLoaded: number,
): ImportJobDto {
  const total = job.total;
  const materialTotal = episodesLoaded + pendingEpisodes;
  const progressPercent =
    materialTotal > 0 ? Math.min(100, Math.round((episodesLoaded / materialTotal) * 100)) : null;

  const staleRunning =
    job.status === "running" && Date.now() - job.updatedAt.getTime() > STALE_RUNNING_MS;
  const isRunning = job.status === "running" && !staleRunning;
  const eta = estimateImportRemaining({
    phase: job.phase,
    status: job.status,
    processed: job.processed,
    total,
    nextPageUrl: job.nextPageUrl,
    pendingEpisodes,
    episodesLoaded,
    sessionProcessed: job.sessionProcessed,
    sessionTotal: job.sessionTotal,
    sessionStartedAt: job.sessionStartedAt,
    sessionBaselineProcessed: job.sessionBaselineProcessed,
    lastItemsPerSecond: job.lastItemsPerSecond,
    isRunning,
  });

  return {
    phase: job.phase,
    status: job.status,
    processed: job.processed,
    total,
    materialTotal,
    pendingEpisodes,
    episodesLoaded,
    progressPercent,
    currentItem: job.currentItem,
    sessionProcessed: job.sessionProcessed,
    sessionSkipped: job.sessionSkipped,
    sessionTotal: job.sessionTotal,
    lastError: job.lastError,
    updatedAt: job.updatedAt.toISOString(),
    isRunning,
    remainingSeconds: eta.remainingSeconds,
    remainingLabel: eta.remainingLabel,
    remainingIsEstimate: eta.isEstimate,
  };
}

export async function getImportJobStatus(): Promise<ImportJobDto | null> {
  const [job, pendingEpisodes, episodesLoaded] = await Promise.all([
    prisma.kodikImportJob.findUnique({ where: { id: "full" } }),
    prisma.kodikMaterial.count({ where: { episodesLoaded: false } }),
    prisma.kodikMaterial.count({ where: { episodesLoaded: true } }),
  ]);

  if (!job) return null;

  let effectiveJob = job;
  const staleRunning =
    job.status === "running" && Date.now() - job.updatedAt.getTime() > STALE_RUNNING_MS;

  if (staleRunning) {
    const healedStatus = pendingEpisodes > 0 ? "paused" : "done";
    await prisma.kodikImportJob.update({
      where: { id: "full" },
      data: {
        status: healedStatus,
        currentItem: null,
        sessionStartedAt: null,
      },
    });
    effectiveJob = {
      ...job,
      status: healedStatus,
      currentItem: null,
      sessionStartedAt: null,
    };
  }

  return buildImportJobDto(effectiveJob, pendingEpisodes, episodesLoaded);
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    releaseStats,
    users,
    activeSessions,
    releasesLast24h,
    pendingEpisodes,
    materialsWithoutShikimori,
    importJob,
    storage,
    build,
  ] = await Promise.all([
    getReleaseStats(),
    prisma.user.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.kodikEpisodeRelease.count({ where: { releasedAt: { gte: dayAgo } } }),
    prisma.kodikMaterial.count({ where: { episodesLoaded: false } }),
    prisma.kodikMaterial.count({ where: { shikimoriId: null } }),
    getImportJobStatus(),
    getAdminStorageStats(),
    getSiteBuildInfo(),
  ]);

  return {
    releases: releaseStats.releases,
    materials: releaseStats.materials,
    episodes: releaseStats.episodes,
    users,
    activeSessions,
    releasesLast24h,
    pendingEpisodes,
    materialsWithoutShikimori,
    importJob,
    storage,
    build,
  };
}

export type AdminUserRow = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  createdAt: string;
  sessions: number;
  listEntries: number;
};

export async function getAdminUsers(limit = 50): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      _count: {
        select: {
          sessions: true,
          animeListEntries: true,
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    shikimoriId: user.shikimoriId,
    nickname: user.nickname,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
    sessions: user._count.sessions,
    listEntries: user._count.animeListEntries,
  }));
}

export type DataQualityStats = {
  materialsWithoutShikimori: number;
  pendingEpisodes: number;
  stubMaterials: number;
  recentMaterials: {
    kodikId: string;
    title: string;
    shikimoriId: number | null;
    episodesLoaded: boolean;
    kodikUpdatedAt: string | null;
  }[];
};

export async function getDataQualityStats(): Promise<DataQualityStats> {
  const [materialsWithoutShikimori, pendingEpisodes, stubMaterials, recentMaterials] =
    await Promise.all([
      prisma.kodikMaterial.count({ where: { shikimoriId: null } }),
      prisma.kodikMaterial.count({ where: { episodesLoaded: false } }),
      prisma.kodikMaterial.count({ where: { translationType: "shikimori-cache" } }),
      prisma.kodikMaterial.findMany({
        orderBy: { kodikUpdatedAt: "desc" },
        take: 15,
        select: {
          kodikId: true,
          title: true,
          shikimoriId: true,
          episodesLoaded: true,
          kodikUpdatedAt: true,
        },
      }),
    ]);

  return {
    materialsWithoutShikimori,
    pendingEpisodes,
    stubMaterials,
    recentMaterials: recentMaterials.map((row) => ({
      kodikId: row.kodikId,
      title: row.title,
      shikimoriId: row.shikimoriId,
      episodesLoaded: row.episodesLoaded,
      kodikUpdatedAt: row.kodikUpdatedAt?.toISOString() ?? null,
    })),
  };
}
