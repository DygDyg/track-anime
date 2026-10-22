import { HolidayThemeSettingsPanel } from "@/components/admin/HolidayThemeSettingsPanel";
import { getHolidayThemeSettingsDto } from "@/lib/admin/holiday-theme-settings";
import { HOLIDAY_THEME_CATALOG } from "@/lib/holiday-theme";

export default async function AdminHolidaysPage() {
  const settings = await getHolidayThemeSettingsDto();

  return <HolidayThemeSettingsPanel initialSettings={settings} catalog={HOLIDAY_THEME_CATALOG} />;
}
