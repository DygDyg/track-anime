import { saveKodikMaterial } from "@/db/save-material";
import { kodikSearch } from "@/kodik/client";
import { prisma } from "@/lib/prisma";

/**
 * If local DB has no real Kodik materials for a shikimoriId, fetch them from Kodik
 * search (covers films `type=anime` that were excluded from anime-serial import).
 */
export async function ensureKodikMaterialsForShikimoriId(shikimoriId: number): Promise<number> {
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) return 0;

  let response;
  try {
    response = await kodikSearch({
      shikimori_id: shikimoriId,
      with_material_data: true,
    });
  } catch (error) {
    console.warn(`[kodik-ensure] search failed for shikimori_id=${shikimoriId}`, error);
    return 0;
  }

  let saved = 0;
  for (const material of response.results ?? []) {
    const materialShikimoriId =
      material.shikimori_id != null && material.shikimori_id !== ""
        ? Number(material.shikimori_id)
        : null;
    if (materialShikimoriId !== shikimoriId) continue;
    if (!material.translation) continue;

    try {
      await saveKodikMaterial(prisma, material, {
        loadEpisodes: Boolean(material.seasons),
        trackReleases: false,
      });
      saved += 1;
    } catch (error) {
      console.warn(`[kodik-ensure] save failed for ${material.id}`, error);
    }
  }

  return saved;
}
