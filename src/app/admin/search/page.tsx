import { SearchSettingsPanel } from "@/components/admin/SearchSettingsPanel";
import {
  MAX_HEADER_SEARCH_DEBOUNCE_MS,
  MIN_HEADER_SEARCH_DEBOUNCE_MS,
} from "@/lib/search-shared";
import { getSearchSettingsDto } from "@/lib/search-settings";

export const dynamic = "force-dynamic";

export default async function AdminSearchSettingsPage() {
  const settings = await getSearchSettingsDto();

  return (
    <SearchSettingsPanel
      initialSettings={settings}
      minHeaderSearchDebounceMs={MIN_HEADER_SEARCH_DEBOUNCE_MS}
      maxHeaderSearchDebounceMs={MAX_HEADER_SEARCH_DEBOUNCE_MS}
    />
  );
}
