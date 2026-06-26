"use client";

import { useThemeContext } from "@/components/ThemeProvider";

export function useDocumentTheme() {
  return useThemeContext().theme;
}
