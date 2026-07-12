import { BrandRotationSettingsPanel } from "@/components/admin/BrandRotationSettingsPanel";
import {
  MAX_BRAND_ROTATION_INTERVAL_MINUTES,
  MIN_BRAND_ROTATION_INTERVAL_MINUTES,
  getBrandRotationSettingsDto,
} from "@/lib/admin/brand-rotation-settings";
import { BRAND_LOGOS_DIR, getActiveBrandAsset, listBrandLogoFiles } from "@/lib/brand-rotation";

export default async function AdminBrandPage() {
  const [settings, files, brand] = await Promise.all([
    getBrandRotationSettingsDto(),
    listBrandLogoFiles(),
    getActiveBrandAsset(),
  ]);

  return (
    <BrandRotationSettingsPanel
      initialSettings={settings}
      minIntervalMinutes={MIN_BRAND_ROTATION_INTERVAL_MINUTES}
      maxIntervalMinutes={MAX_BRAND_ROTATION_INTERVAL_MINUTES}
      initialLogoCount={files.length}
      logosDir={BRAND_LOGOS_DIR}
      initialActiveLogoSrc={brand.logoSrc}
      initialActiveLogoFileName={brand.file?.fileName ?? null}
    />
  );
}
