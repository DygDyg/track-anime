export type KodikTranslation = {
  id: number;
  title: string;
  type: "voice" | "subtitles" | string;
};

export type KodikEpisodeValue =
  | string
  | {
      link: string;
      title?: string;
      screenshots?: string[];
    };

export type KodikSeason = {
  link?: string;
  episodes?: Record<string, KodikEpisodeValue>;
};

export type KodikMaterial = {
  id: string;
  type: string;
  link?: string;
  title: string;
  title_orig?: string;
  other_title?: string;
  year?: number;
  shikimori_id?: string | number;
  quality?: string;
  translation?: KodikTranslation;
  last_season?: number;
  last_episode?: number;
  episodes_count?: number;
  created_at?: string;
  updated_at?: string;
  worldart_link?: string;
  worldart_animation_id?: string | number;
  worldart_cinema_id?: string | number;
  seasons?: Record<string, KodikSeason>;
  material_data?: {
    title?: string;
    anime_title?: string;
    poster_url?: string;
    anime_poster_url?: string;
    worldart_link?: string;
    worldart_poster_url?: string;
    worldart_animation_id?: string | number;
    worldart_cinema_id?: string | number;
  };
};

export type KodikListResponse = {
  time?: string;
  total: number;
  prev_page?: string | null;
  next_page?: string | null;
  results: KodikMaterial[];
};

export type KodikSearchResponse = {
  time?: string;
  total: number;
  results: KodikMaterial[];
};
