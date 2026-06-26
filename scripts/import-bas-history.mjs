import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const USER_SHIKIMORI_ID = 1393072;
const BAS_PATH = new URL("../bas.json", import.meta.url);

const prisma = new PrismaClient();

function normalizeSeason(season) {
  if (season == null || season <= 0) return 1;
  return season;
}

function normalizeEpisode(episode, materialData) {
  if (episode != null && episode > 0) return episode;
  const total = materialData?.episodes_total;
  if (typeof total === "number" && total > 0) return Math.min(1, total);
  return 1;
}

function parseBasEntries(raw) {
  const current = raw?.BaseAnimeCurrent;
  if (!current || typeof current !== "object") {
    throw new Error("bas.json: missing BaseAnimeCurrent");
  }

  const entries = [];
  for (const [key, value] of Object.entries(current)) {
    if (!/^\d+$/.test(key)) continue;
    if (!value || typeof value !== "object") continue;

    const shikimoriId = Number(key);
    if (!Number.isFinite(shikimoriId)) continue;

    entries.push({
      shikimoriId,
      translationId: value.translation?.id ?? null,
      translationTitle: value.translation?.title?.trim() ?? null,
      seasonNumber: normalizeSeason(value.season),
      episodeNumber: normalizeEpisode(value.episode, value.material_data),
      positionSeconds: typeof value.time === "number" && value.time > 0 ? value.time : 0,
      updatedAt:
        typeof value.lasttime === "number"
          ? new Date(value.lasttime * 1000)
          : typeof value.time === "number"
            ? new Date()
            : null,
      materialTitle: value.material_data?.anime_title ?? value.material_data?.title ?? null,
    });
  }

  return entries;
}

function pickMaterial(materials, translationId, translationTitle) {
  if (materials.length === 0) return null;

  if (translationId != null) {
    const byId = materials.filter((m) => m.translationId === translationId);
    if (byId.length === 1) return byId[0];
    if (byId.length > 1 && translationTitle) {
      const exact = byId.find(
        (m) => m.translationTitle.toLowerCase() === translationTitle.toLowerCase(),
      );
      if (exact) return exact;
      return byId[0];
    }
    if (byId.length > 0) return byId[0];
  }

  if (translationTitle) {
    const lower = translationTitle.toLowerCase();
    const byTitle = materials.find((m) => m.translationTitle.toLowerCase() === lower);
    if (byTitle) return byTitle;
    const partial = materials.find((m) => m.translationTitle.toLowerCase().includes(lower));
    if (partial) return partial;
  }

  return materials[0];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = JSON.parse(readFileSync(BAS_PATH, "utf8"));
  const entries = parseBasEntries(raw);

  const user = await prisma.user.findFirst({
    where: { shikimoriId: USER_SHIKIMORI_ID },
    select: { id: true, shikimoriId: true, nickname: true },
  });

  if (!user) {
    throw new Error(`User with shikimoriId=${USER_SHIKIMORI_ID} not found`);
  }

  console.log(`User: ${user.nickname} (${user.id}, shikimoriId=${user.shikimoriId})`);
  console.log(`Parsed ${entries.length} history entries from bas.json`);

  const shikimoriIds = [...new Set(entries.map((e) => e.shikimoriId))];
  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId: { in: shikimoriIds } },
    select: {
      kodikId: true,
      shikimoriId: true,
      translationId: true,
      translationTitle: true,
      title: true,
    },
  });

  const materialsByShikimori = new Map();
  for (const material of materials) {
    if (material.shikimoriId == null) continue;
    const list = materialsByShikimori.get(material.shikimoriId) ?? [];
    list.push(material);
    materialsByShikimori.set(material.shikimoriId, list);
  }

  const imported = [];
  const skipped = [];

  for (const entry of entries) {
    const list = materialsByShikimori.get(entry.shikimoriId) ?? [];
    const material = pickMaterial(list, entry.translationId, entry.translationTitle);

    if (!material) {
      skipped.push({
        shikimoriId: entry.shikimoriId,
        title: entry.materialTitle,
        reason: "no KodikMaterial in DB",
        translation: entry.translationTitle,
      });
      continue;
    }

    const payload = {
      userId: user.id,
      shikimoriId: entry.shikimoriId,
      kodikId: material.kodikId,
      seasonNumber: entry.seasonNumber,
      episodeNumber: entry.episodeNumber,
      positionSeconds: entry.positionSeconds,
      updatedAt: entry.updatedAt ?? new Date(),
      createdAt: entry.updatedAt ?? new Date(),
    };

    if (!dryRun) {
      await prisma.userWatchProgress.upsert({
        where: {
          userId_shikimoriId: {
            userId: user.id,
            shikimoriId: entry.shikimoriId,
          },
        },
        create: payload,
        update: {
          kodikId: payload.kodikId,
          seasonNumber: payload.seasonNumber,
          episodeNumber: payload.episodeNumber,
          positionSeconds: payload.positionSeconds,
          updatedAt: payload.updatedAt,
        },
      });
    }

    imported.push({
      shikimoriId: entry.shikimoriId,
      title: entry.materialTitle ?? material.title,
      episode: `S${payload.seasonNumber}E${payload.episodeNumber}`,
      translation: material.translationTitle,
      kodikId: material.kodikId,
    });
  }

  console.log(`\n${dryRun ? "[DRY RUN] Would import" : "Imported"}: ${imported.length}`);
  console.log(`Skipped: ${skipped.length}`);

  if (skipped.length > 0) {
    console.log("\nSkipped entries:");
    for (const item of skipped) {
      console.log(`  - ${item.shikimoriId} ${item.title ?? "?"} (${item.translation ?? "?"}) — ${item.reason}`);
    }
  }

  const finalCount = dryRun
    ? await prisma.userWatchProgress.count({ where: { userId: user.id } })
    : await prisma.userWatchProgress.count({ where: { userId: user.id } });

  console.log(`\nTotal watch progress rows for user: ${finalCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
