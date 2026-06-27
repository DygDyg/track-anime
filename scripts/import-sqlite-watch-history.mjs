import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_SQLITE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "ta_user_base.db",
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipExisting = args.includes("--skip-existing");
const createUsers = args.includes("--create-users");
const sqliteArg = args.find((a) => a.startsWith("--sqlite="));
const SQLITE_PATH = sqliteArg?.slice("--sqlite=".length) ?? process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH;

const prisma = new PrismaClient();

const SHIKIMORI_HOST = process.env.SHIKIMORI_HOST?.trim().toLowerCase() || "shikimori.io";

async function fetchShikimoriUserProfile(shikimoriId) {
  const res = await fetch(`https://${SHIKIMORI_HOST}/api/users/${shikimoriId}`, {
    headers: {
      "User-Agent": process.env.SHIKIMORI_APP_NAME?.trim() || "TrackAnime",
      Accept: "application/json",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Shikimori users/${shikimoriId}: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data?.nickname) return null;
  return {
    nickname: String(data.nickname).trim(),
    avatar: data.avatar ?? null,
  };
}

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

function parseBaseAnimeCurrent(current) {
  if (!current || typeof current !== "object") return [];

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

function loadSqliteUsers() {
  const db = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const rows = db.prepare("SELECT user_id, settings FROM user_settings").all();

  const users = [];
  for (const row of rows) {
    let settings;
    try {
      settings = JSON.parse(row.settings);
    } catch {
      users.push({ shikimoriId: Number(row.user_id), entries: [], error: "invalid_json" });
      continue;
    }

    const entries = parseBaseAnimeCurrent(settings?.BaseAnimeCurrent);
    users.push({
      shikimoriId: Number(row.user_id),
      entries,
    });
  }

  return users;
}

async function main() {
  const sqliteUsers = loadSqliteUsers().filter((u) => u.entries.length > 0);

  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`Users with BaseAnimeCurrent: ${sqliteUsers.length}`);
  console.log(`Options: dryRun=${dryRun} skipExisting=${skipExisting} createUsers=${createUsers}`);

  const allShikimoriIds = [...new Set(sqliteUsers.flatMap((u) => u.entries.map((e) => e.shikimoriId)))];
  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId: { in: allShikimoriIds } },
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

  const summary = {
    usersProcessed: 0,
    usersCreated: 0,
    usersSkippedNoAccount: 0,
    imported: 0,
    skippedNoMaterial: 0,
    skippedAlreadyHave: 0,
    perUser: [],
  };

  for (const sqliteUser of sqliteUsers) {
    let user = await prisma.user.findUnique({
      where: { shikimoriId: sqliteUser.shikimoriId },
      select: { id: true, nickname: true, shikimoriId: true },
    });

    if (!user) {
      if (!createUsers) {
        summary.usersSkippedNoAccount += 1;
        summary.perUser.push({
          shikimoriId: sqliteUser.shikimoriId,
          status: "no_account",
          entries: sqliteUser.entries.length,
        });
        continue;
      }

      if (dryRun) {
        summary.perUser.push({
          shikimoriId: sqliteUser.shikimoriId,
          status: "would_create_user",
          entries: sqliteUser.entries.length,
        });
        continue;
      }

      const profile = await fetchShikimoriUserProfile(sqliteUser.shikimoriId);
      user = await prisma.user.create({
        data: {
          shikimoriId: sqliteUser.shikimoriId,
          nickname: profile?.nickname ?? `user_${sqliteUser.shikimoriId}`,
          avatar: profile?.avatar ?? null,
        },
        select: { id: true, nickname: true, shikimoriId: true },
      });
      summary.usersCreated += 1;
    }

    const existingShikimoriIds = skipExisting
      ? new Set(
          (
            await prisma.userWatchProgress.findMany({
              where: { userId: user.id },
              select: { shikimoriId: true },
            })
          ).map((row) => row.shikimoriId),
        )
      : null;

    let userImported = 0;
    let userSkippedNoMaterial = 0;
    let userSkippedAlreadyHave = 0;
    const skippedItems = [];

    for (const entry of sqliteUser.entries) {
      if (existingShikimoriIds?.has(entry.shikimoriId)) {
        userSkippedAlreadyHave += 1;
        continue;
      }

      const list = materialsByShikimori.get(entry.shikimoriId) ?? [];
      const material = pickMaterial(list, entry.translationId, entry.translationTitle);

      if (!material) {
        userSkippedNoMaterial += 1;
        skippedItems.push({
          shikimoriId: entry.shikimoriId,
          title: entry.materialTitle,
          reason: "no KodikMaterial",
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
        await prisma.userWatchProgress.create({ data: payload });
      }

      userImported += 1;
      existingShikimoriIds?.add(entry.shikimoriId);
    }

    summary.usersProcessed += 1;
    summary.imported += userImported;
    summary.skippedNoMaterial += userSkippedNoMaterial;
    summary.skippedAlreadyHave += userSkippedAlreadyHave;

    const finalCount = await prisma.userWatchProgress.count({ where: { userId: user.id } });

    summary.perUser.push({
      shikimoriId: sqliteUser.shikimoriId,
      nickname: user.nickname,
      status: "ok",
      imported: userImported,
      skippedNoMaterial: userSkippedNoMaterial,
      skippedAlreadyHave: userSkippedAlreadyHave,
      totalInDb: finalCount,
      skippedSample: skippedItems.slice(0, 3),
    });
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Summary:`);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
