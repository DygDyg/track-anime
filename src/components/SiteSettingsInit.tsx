"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { siteSettingsInitScript } from "@/lib/site-settings";

export function SiteSettingsInit() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: siteSettingsInitScript }} />;
  });

  return null;
}
