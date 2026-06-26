"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { themeInitScript } from "@/lib/theme";

export function ThemeInit() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
  });

  return null;
}
