#!/usr/bin/env tsx
import "dotenv/config";
import { kodikSearch } from "../src/kodik/client";

const kodikId = process.argv[2] ?? "serial-75306";

const res = await kodikSearch({
  id: kodikId,
  with_material_data: true,
});

const material = res.results[0];
console.log(
  JSON.stringify(
    {
      id: material?.id,
      shikimori_id: material?.shikimori_id,
      worldart_link: material?.worldart_link,
      worldart_animation_id: material?.worldart_animation_id,
      anime_poster_url: material?.material_data?.anime_poster_url,
      poster_url: material?.material_data?.poster_url,
    },
    null,
    2,
  ),
);
