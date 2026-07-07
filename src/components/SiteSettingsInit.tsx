"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { buildSiteSettingsInitScript, type SiteSettings } from "@/lib/site-settings";

export function SiteSettingsInit({ defaults }: { defaults: SiteSettings }) {
  const inserted = useRef(false);
  const script = buildSiteSettingsInitScript(defaults);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: script }} />;
  });

  return null;
}
