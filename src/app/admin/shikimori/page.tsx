import { ShikimoriSettingsPanel } from "@/components/admin/ShikimoriSettingsPanel";
import {
  getShikimoriSettingsDto,
  SHIKIMORI_HOST_PRESETS,
} from "@/lib/shikimori/endpoints";

export const dynamic = "force-dynamic";

export default async function AdminShikimoriPage() {
  const settings = await getShikimoriSettingsDto();

  return (
    <ShikimoriSettingsPanel
      initialSettings={settings}
      presets={[...SHIKIMORI_HOST_PRESETS]}
    />
  );
}
