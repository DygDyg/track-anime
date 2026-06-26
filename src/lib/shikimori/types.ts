export type ShikimoriNamedEntry = {
  id: number;
  name: string;
  russian?: string;
};

export type ShikimoriGenre = ShikimoriNamedEntry & {
  kind?: string;
  entry_type?: string;
};

export type ShikimoriStudio = ShikimoriNamedEntry & {
  filtered_name?: string;
  real?: boolean;
  image?: string;
};

export type ShikimoriImage = {
  original?: string;
  preview?: string;
  x96?: string;
  x48?: string;
};

export type ShikimoriScreenshot = {
  original?: string;
  preview?: string;
};

export type ShikimoriRelatedAnime = {
  id: number;
  name: string;
  russian: string | null;
  image: ShikimoriImage | null;
  url: string;
  kind: string;
  score: string | null;
  status: string;
  episodes: number | null;
  episodes_aired: number | null;
  aired_on: string | null;
  released_on: string | null;
};

export type ShikimoriRelatedEntry = {
  relation: string;
  relation_russian: string;
  anime: ShikimoriRelatedAnime | null;
  manga: unknown | null;
};

export type ShikimoriScoreStat = {
  name: number;
  value: number;
};

export type ShikimoriAnime = {
  id: number;
  name: string;
  russian: string | null;
  image: ShikimoriImage | null;
  url: string;
  kind: string;
  score: string | null;
  rates_scores_stats?: ShikimoriScoreStat[];
  status: "anons" | "ongoing" | "released" | string;
  episodes: number | null;
  episodes_aired: number | null;
  aired_on: string | null;
  released_on: string | null;
  rating: string | null;
  duration: number | null;
  description: string | null;
  description_html: string | null;
  franchise: string | null;
  genres: ShikimoriGenre[];
  studios: ShikimoriStudio[];
  screenshots: ShikimoriScreenshot[];
  english?: string[];
  japanese?: string[];
  synonyms?: string[];
  fansubbers?: string[];
  fandubbers?: string[];
  videos?: ShikimoriVideo[];
};

export type ShikimoriVideo = {
  id?: number;
  url?: string;
  image_url?: string;
  player_url?: string;
  name?: string;
  kind?: string;
  hosting?: string;
};
