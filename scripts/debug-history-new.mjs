import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CUTOFF = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

function episodeRank(season, episode) {
  return season * 100_000 + episode;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { shikimoriId: 1393072 },
    select: { id: true },
  });
  if (!user) throw new Error("no user");

  const progressRows = await prisma.userWatchProgress.findMany({
    where: { userId: user.id },
    select: { shikimoriId: true, seasonNumber: true, episodeNumber: true, kodikId: true },
  });

  const materials = await prisma.kodikMaterial.findMany({
    where: { kodikId: { in: [...new Set(progressRows.map((r) => r.kodikId))] }, lastEpisode: { gt: 0 } },
    select: {
      kodikId: true,
      shikimoriId: true,
      title: true,
      lastSeason: true,
      lastEpisode: true,
      kodikUpdatedAt: true,
      updatedAt: true,
      materialData: true,
    },
  });
  const byKodik = new Map(materials.map((m) => [m.kodikId, m]));

  const candidates = [];
  for (const p of progressRows) {
    const m = byKodik.get(p.kodikId);
    if (!m?.lastEpisode) continue;
    const ls = m.lastSeason ?? 1;
    const le = m.lastEpisode;
    if (episodeRank(ls, le) <= episodeRank(p.seasonNumber, p.episodeNumber)) continue;
    candidates.push({ p, m, ls, le });
  }

  console.log("candidates with unwatched latest:", candidates.length);
  console.log("cutoff:", CUTOFF.toISOString());

  for (const { p, m, ls, le } of candidates) {
    const data = m.materialData ?? {};
    const status = data.anime_status ?? data.all_status ?? "?";
    const year = data.year ?? "?";
    const releasedAt = data.released_at ?? data.aired_at ?? null;

    const [ep, rel] = await Promise.all([
      prisma.kodikEpisode.findUnique({
        where: { materialId_seasonNumber_episodeNumber: { materialId: m.kodikId, seasonNumber: ls, episodeNumber: le } },
        select: { firstSeenAt: true },
      }),
      prisma.kodikEpisodeRelease.findUnique({
        where: { materialId_seasonNumber_episodeNumber: { materialId: m.kodikId, seasonNumber: ls, episodeNumber: le } },
        select: { releasedAt: true },
      }),
    ]);

    const epDate = rel?.releasedAt ?? ep?.firstSeenAt ?? null;
    const isBacklog =
      status === "released" &&
      ((releasedAt && new Date(releasedAt) < CUTOFF) ||
        (data.episodes_total && le >= data.episodes_total && data.year && data.year < CUTOFF.getFullYear() - 1));

    const ok = !isBacklog && epDate && epDate >= CUTOFF;

    console.log(
      [
        ok ? "OK" : "NO",
        m.shikimoriId,
        (data.anime_title ?? m.title)?.slice(0, 40),
        `status=${status}`,
        `year=${year}`,
        `W${p.seasonNumber}E${p.episodeNumber}->S${ls}E${le}`,
        `rel=${rel?.releasedAt?.toISOString().slice(0, 10) ?? "-"}`,
        `seen=${ep?.firstSeenAt?.toISOString().slice(0, 10) ?? "-"}`,
        `kUpd=${m.kodikUpdatedAt?.toISOString().slice(0, 10) ?? "-"}`,
        `end=${releasedAt ?? "-"}`,
      ].join(" | "),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
