import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeKodikGenreKey, parseKodikGenres } from "@/lib/kodik-material-meta";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";

export type AnimeCatalogDb = PrismaClient | Prisma.TransactionClient;

export type AnimeCatalogAliasSource =
  | "title"
  | "titleOrig"
  | "otherTitle"
  | "anime_title"
  | "other_titles"
  | "other_titles_en"
  | "other_titles_jp"
  | "license"
  | "material";

export type AnimeCatalogUpsertInput = {
  shikimoriId: number;
  title: string;
  titleOrig?: string | null;
  description?: string | null;
  status?: string | null;
  kind?: string | null;
  score?: string | null;
  year?: number | null;
  episodesTotal?: number | null;
  episodesAired?: number | null;
  airedOn?: Date | null;
  releasedOn?: Date | null;
  nextEpisodeAt?: Date | null;
  posterUrl?: string | null;
  animeLicenseName?: string | null;
  source?: string;
  aliases?: Array<{ title: string; source: AnimeCatalogAliasSource }>;
  genres?: string[];
};

export type AnimeCatalogUpsertResult = {
  shikimoriId: number;
  aliasesWritten: number;
  genresWritten: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPositiveInt(value: unknown): number | null {
  const n = readNumber(value);
  if (n == null || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseDateOnly(value: unknown): Date | null {
  const raw = readString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scoreToString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return readString(value);
}

/** Нормализация для unique alias (поиск позже может использовать ILIKE по title). */
export function normalizeAnimeAliasTitle(title: string): string {
  return title
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function pushAlias(
  bucket: Map<string, { title: string; source: AnimeCatalogAliasSource }>,
  title: string | null | undefined,
  source: AnimeCatalogAliasSource,
) {
  const trimmed = title?.trim();
  if (!trimmed) return;
  const key = normalizeAnimeAliasTitle(trimmed);
  if (!key || bucket.has(key)) return;
  bucket.set(key, { title: trimmed, source });
}

function pushAliasList(
  bucket: Map<string, { title: string; source: AnimeCatalogAliasSource }>,
  value: unknown,
  source: AnimeCatalogAliasSource,
) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string") pushAlias(bucket, item, source);
  }
}

export type MaterialCatalogSource = {
  shikimoriId: number | null;
  title: string;
  titleOrig?: string | null;
  otherTitle?: string | null;
  year?: number | null;
  materialData?: unknown;
};

/**
 * Собирает поля каталога + алиасы + жанры из одного KodikMaterial (и materialData).
 */
export function buildAnimeCatalogInputFromMaterial(
  material: MaterialCatalogSource,
): AnimeCatalogUpsertInput | null {
  if (material.shikimoriId == null || material.shikimoriId <= 0) return null;

  const data = asRecord(material.materialData);
  const animeFull = asRecord(data.anime_full);

  const title =
    readString(data.anime_title) ??
    readString(animeFull.russian) ??
    readString(material.title) ??
    "Без названия";
  const titleOrig =
    readString(material.titleOrig) ??
    readString(data.title_en) ??
    readString(animeFull.name) ??
    null;

  const description =
    readString(data.anime_description) ??
    readString(data.description) ??
    readString(animeFull.description) ??
    null;

  const status =
    readString(data.anime_status) ??
    readString(data.all_status) ??
    readString(animeFull.status) ??
    null;
  const kind =
    readString(data.anime_kind) ?? readString(animeFull.kind) ?? null;
  const score =
    scoreToString(data.shikimori_rating) ??
    scoreToString(data.shikimori_score) ??
    scoreToString(animeFull.score) ??
    null;

  const year =
    material.year ??
    readPositiveInt(data.year) ??
    (() => {
      const aired = readString(animeFull.aired_on) ?? readString(data.aired_at);
      if (!aired || aired.length < 4) return null;
      const y = Number(aired.slice(0, 4));
      return Number.isFinite(y) ? y : null;
    })();

  const episodesTotal =
    readPositiveInt(data.episodes_total) ??
    readPositiveInt(data.shikimori_episodes) ??
    readPositiveInt(animeFull.episodes) ??
    null;
  const episodesAired =
    readPositiveInt(data.episodes_aired) ??
    readPositiveInt(animeFull.episodes_aired) ??
    null;

  const airedOn =
    parseDateOnly(data.aired_at) ??
    parseDateOnly(animeFull.aired_on) ??
    null;
  const releasedOn =
    parseDateOnly(data.released_at) ??
    parseDateOnly(animeFull.released_on) ??
    parseDateOnly(animeFull.released_at) ??
    null;
  const nextEpisodeAt = parseDateOnly(data.next_episode_at);

  const posterUrl = resolveMaterialPosterUrl({
    anime_poster_url: readString(data.anime_poster_url),
    poster_url: readString(data.poster_url),
    worldart_poster_url: readString(data.worldart_poster_url),
    worldart_link: readString(data.worldart_link),
  } satisfies MaterialPosterSource);

  const animeLicenseName = readString(data.anime_license_name);

  const aliases = new Map<string, { title: string; source: AnimeCatalogAliasSource }>();
  pushAlias(aliases, title, "anime_title");
  pushAlias(aliases, material.title, "title");
  pushAlias(aliases, titleOrig, "titleOrig");
  pushAlias(aliases, material.otherTitle, "otherTitle");
  pushAlias(aliases, animeLicenseName, "license");
  pushAliasList(aliases, data.other_titles, "other_titles");
  pushAliasList(aliases, data.other_titles_en, "other_titles_en");
  pushAliasList(aliases, data.other_titles_jp, "other_titles_jp");
  pushAliasList(aliases, animeFull.synonyms, "other_titles");

  const genreKeys = new Set<string>();
  for (const g of parseKodikGenres(data.anime_genres ?? data.all_genres ?? data.genres)) {
    genreKeys.add(normalizeKodikGenreKey(g));
  }
  // anime_full.genres may be objects { name, russian }
  if (Array.isArray(animeFull.genres)) {
    for (const item of animeFull.genres) {
      if (item && typeof item === "object") {
        const name =
          readString((item as Record<string, unknown>).russian) ??
          readString((item as Record<string, unknown>).name);
        if (name) genreKeys.add(normalizeKodikGenreKey(name));
      } else if (typeof item === "string") {
        genreKeys.add(normalizeKodikGenreKey(item));
      }
    }
  }

  return {
    shikimoriId: material.shikimoriId,
    title,
    titleOrig,
    description,
    status,
    kind,
    score,
    year,
    episodesTotal,
    episodesAired,
    airedOn,
    releasedOn,
    nextEpisodeAt,
    posterUrl,
    animeLicenseName,
    source: "kodik",
    aliases: [...aliases.values()],
    genres: [...genreKeys].filter(Boolean),
  };
}

function preferLonger(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = a?.trim() || null;
  const right = b?.trim() || null;
  if (!left) return right;
  if (!right) return left;
  return right.length >= left.length ? right : left;
}

function preferNumberMax(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Upsert каталога. Алиасы/жанры мержатся (не затирают другие источники).
 * Пустые поля в input не затирают уже заполненные в БД.
 */
export async function upsertAnimeCatalog(
  db: AnimeCatalogDb,
  input: AnimeCatalogUpsertInput,
): Promise<AnimeCatalogUpsertResult> {
  const shikimoriId = input.shikimoriId;
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) {
    return { shikimoriId: 0, aliasesWritten: 0, genresWritten: 0 };
  }

  const existing = await db.animeCatalog.findUnique({
    where: { shikimoriId },
    select: {
      title: true,
      titleOrig: true,
      description: true,
      status: true,
      kind: true,
      score: true,
      year: true,
      episodesTotal: true,
      episodesAired: true,
      airedOn: true,
      releasedOn: true,
      nextEpisodeAt: true,
      posterUrl: true,
      animeLicenseName: true,
    },
  });

  const title = preferLonger(existing?.title, input.title) ?? input.title;
  const data = {
    title,
    titleOrig: preferLonger(existing?.titleOrig, input.titleOrig ?? null),
    description: preferLonger(existing?.description, input.description ?? null),
    status: readString(input.status) ?? existing?.status ?? null,
    kind: readString(input.kind) ?? existing?.kind ?? null,
    score: readString(input.score) ?? existing?.score ?? null,
    year: input.year ?? existing?.year ?? null,
    episodesTotal: preferNumberMax(existing?.episodesTotal, input.episodesTotal ?? null),
    episodesAired: preferNumberMax(existing?.episodesAired, input.episodesAired ?? null),
    airedOn: input.airedOn ?? existing?.airedOn ?? null,
    releasedOn: input.releasedOn ?? existing?.releasedOn ?? null,
    nextEpisodeAt: input.nextEpisodeAt ?? existing?.nextEpisodeAt ?? null,
    posterUrl: preferLonger(existing?.posterUrl, input.posterUrl ?? null),
    animeLicenseName: preferLonger(existing?.animeLicenseName, input.animeLicenseName ?? null),
    source: input.source ?? "kodik",
    syncedAt: new Date(),
  };

  await db.animeCatalog.upsert({
    where: { shikimoriId },
    create: { shikimoriId, ...data },
    update: data,
  });

  let aliasesWritten = 0;
  if (input.aliases && input.aliases.length > 0) {
    const rows = input.aliases
      .map((alias) => {
        const titleText = alias.title.trim();
        const titleNormalized = normalizeAnimeAliasTitle(titleText);
        if (!titleNormalized) return null;
        return {
          shikimoriId,
          title: titleText,
          titleNormalized,
          source: alias.source,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    if (rows.length > 0) {
      const result = await db.animeTitleAlias.createMany({
        data: rows,
        skipDuplicates: true,
      });
      aliasesWritten = result.count;
    }
  }

  let genresWritten = 0;
  if (input.genres && input.genres.length > 0) {
    const rows = input.genres
      .map((genre) => ({
        shikimoriId,
        genreKey: normalizeKodikGenreKey(genre),
      }))
      .filter((row) => Boolean(row.genreKey));

    if (rows.length > 0) {
      const result = await db.animeGenre.createMany({
        data: rows,
        skipDuplicates: true,
      });
      genresWritten = result.count;
    }
  }

  return { shikimoriId, aliasesWritten, genresWritten };
}

/** Dual-write из KodikMaterial: ошибки глотаем снаружи или логируем у вызывающего. */
export async function upsertAnimeCatalogFromMaterial(
  db: AnimeCatalogDb,
  material: MaterialCatalogSource,
): Promise<AnimeCatalogUpsertResult | null> {
  const input = buildAnimeCatalogInputFromMaterial(material);
  if (!input) return null;
  return upsertAnimeCatalog(db, input);
}
