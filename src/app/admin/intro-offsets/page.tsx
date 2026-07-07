import { TranslationIntroOffsetsPanel } from "@/components/admin/TranslationIntroOffsetsPanel";
import { getTranslationIntroSettingsDto } from "@/lib/admin/translation-intro-offsets";
import { getDistinctTranslationNames } from "@/lib/translations-catalog";

export const dynamic = "force-dynamic";

export default async function AdminTranslationIntroOffsetsPage() {
  const [initialData, translationNames] = await Promise.all([
    getTranslationIntroSettingsDto(),
    getDistinctTranslationNames(),
  ]);

  return (
    <TranslationIntroOffsetsPanel
      initialData={initialData}
      translationNames={translationNames}
    />
  );
}
