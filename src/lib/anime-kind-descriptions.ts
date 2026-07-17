const KIND_DESCRIPTIONS: Record<string, string> = {
  tv: "Телевизионный сериал: серии выходят регулярным сезоном и обычно привязаны к расписанию вещания.",
  tv_13: "Короткий телевизионный сезон примерно на 11-13 серий.",
  tv_24: "Двухкуровый телевизионный сезон примерно на 22-26 серий.",
  tv_48: "Длинный телевизионный сериал на несколько куров.",
  movie: "Полнометражный фильм: цельная история для кинотеатрального или отдельного релиза.",
  ova: "OVA: специальные эпизоды, которые обычно выходят отдельно от ТВ-сетки.",
  ona: "ONA: релиз для онлайн-платформ, веб-показа или стриминга.",
  special: "Спешл: бонусный, праздничный, recap- или дополнительный эпизод вне основной нумерации сезона.",
  music: "Музыкальный релиз: клип, концертный фрагмент, PV или история вокруг музыкального номера.",
};

export function normalizeAnimeKindKey(kind: string): string {
  return kind.trim().toLowerCase();
}

export function getAnimeKindDescription(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return KIND_DESCRIPTIONS[normalizeAnimeKindKey(kind)] ?? null;
}
