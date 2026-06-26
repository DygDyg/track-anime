import { CoverCacheSettingsPanel } from "@/components/admin/CoverCacheSettingsPanel";
import {
  COVER_BROWSER_CACHE_OPTIONS,
  COVER_MAX_AGE_OPTIONS,
  getCoverCacheAdminStats,
  getCoverCacheSettingsDto,
} from "@/lib/admin/cover-cache-settings";

export const dynamic = "force-dynamic";

export default async function AdminCoversPage() {
  const [settings, stats] = await Promise.all([
    getCoverCacheSettingsDto(),
    getCoverCacheAdminStats(),
  ]);

  return (
    <CoverCacheSettingsPanel
      initialSettings={settings}
      initialStats={stats}
      maxAgeOptions={[...COVER_MAX_AGE_OPTIONS]}
      browserCacheOptions={[...COVER_BROWSER_CACHE_OPTIONS]}
    />
  );
}
