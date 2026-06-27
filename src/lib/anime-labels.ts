const KIND_LABELS: Record<string, string> = {
  tv: "TV-сериал",
  movie: "Фильм",
  ova: "OVA",
  ona: "ONA",
  special: "Спешл",
  tv_13: "TV (короткий)",
  tv_24: "TV",
  tv_48: "TV (длинный)",
};

const STATUS_LABELS: Record<string, string> = {
  anons: "Анонс",
  ongoing: "Выходит",
  released: "Вышло",
};

const RATING_LABELS: Record<string, string> = {
  none: "Без рейтинга",
  g: "G",
  pg: "PG",
  pg_13: "PG-13",
  r: "R-17",
  r_plus: "R+",
  rx: "Rx",
};

const TRANSLATION_TYPE_LABELS: Record<string, string> = {
  voice: "Озвучка",
  subtitles: "Субтитры",
};

export function labelKind(kind: string | null): string | null {
  if (!kind) return null;
  return KIND_LABELS[kind] ?? kind.toUpperCase();
}

export function labelStatus(status: string | null): string | null {
  if (!status) return null;
  return STATUS_LABELS[status] ?? status;
}

export function statusBadgeClass(status: string | null): string | null {
  switch (status) {
    case "released":
      return "border-emerald-400/55 bg-emerald-300/35 text-emerald-950 dark:bg-emerald-400/25 dark:text-emerald-50";
    case "ongoing":
      return "border-yellow-300/60 bg-yellow-200/45 text-yellow-950 dark:bg-yellow-300/20 dark:text-yellow-50";
    case "anons":
      return "border-violet-400/55 bg-violet-400/25 text-violet-950 dark:bg-violet-500/25 dark:text-violet-100";
    case "latest":
      return "border-sky-400/55 bg-sky-300/35 text-sky-950 dark:bg-sky-400/25 dark:text-sky-50";
    default:
      return null;
  }
}

/** Бейдж номера серии на постере карточки релиза */
export function episodeBadgeClass(status: string | null): string {
  switch (status) {
    case "released":
      return "border-emerald-400/50 bg-emerald-950/85 text-emerald-300";
    case "ongoing":
      return "border-[rgba(158,157,36,0.55)] bg-[rgba(110,109,25,0.9)] text-[rgb(228,227,106)]";
    case "anons":
      return "border-violet-400/50 bg-black/80 text-violet-300";
    default:
      return "border-white/15 bg-black/80 text-white";
  }
}

export function labelRating(rating: string | null): string | null {
  if (!rating) return null;
  return RATING_LABELS[rating] ?? rating.toUpperCase();
}

export function labelTranslationType(type: string): string {
  return TRANSLATION_TYPE_LABELS[type] ?? type;
}

export function formatDateRu(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function broadcastSeasonLabel(month: number): string {
  if (month <= 3) return "Зима";
  if (month <= 6) return "Весна";
  if (month <= 9) return "Лето";
  return "Осень";
}

function parseIsoDateParts(iso: string): { year: number; month: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function formatReleaseSeasonBadge(
  airedOn: string | null,
  releasedOn: string | null,
): string | null {
  const iso = airedOn ?? releasedOn;
  if (!iso) return null;

  const parts = parseIsoDateParts(iso);
  if (!parts) return null;

  return `${broadcastSeasonLabel(parts.month)} ${parts.year}`;
}

export function formatEpisodeProgress(
  _season: number | null,
  episode: number | null,
): string | null {
  if (!episode) return null;
  return `${episode} серия`;
}

const KIND_SHORT_LABELS: Record<string, string> = {
  tv: "TV",
  movie: "Movie",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  tv_13: "TV",
  tv_24: "TV",
  tv_48: "TV",
};

export function labelKindShort(kind: string | null): string | null {
  if (!kind) return null;
  return KIND_SHORT_LABELS[kind] ?? kind.toUpperCase();
}

export function formatDurationRu(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;

  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  let suffix = "минут";
  if (mod10 === 1 && mod100 !== 11) suffix = "минута";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) suffix = "минуты";

  return `${minutes} ${suffix}`;
}

export function formatReleaseYear(airedOn: string | null, releasedOn: string | null): number | null {
  const iso = airedOn ?? releasedOn;
  if (!iso) return null;
  return parseIsoDateParts(iso)?.year ?? null;
}

export function formatScoreVotes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} проголосовавший`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} проголосовавших`;
  return `${count} проголосовавших`;
}
