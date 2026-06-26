"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  DEFAULT_SITE_SETTINGS,
  applySiteSettings,
  buildPopularHomeTranslationFilter,
  normalizeSiteSettings,
  readStoredSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

type SiteSettingsContextValue = {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
  resetSettings: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  toggleTranslationOnHome: (name: string, enabled: boolean, allNames: string[]) => void;
  setAllHomeTranslations: (enabled: boolean, allNames: string[]) => void;
  setPopularHomeTranslations: (allNames: string[]) => void;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

const REMOTE_SAVE_DELAY_MS = 500;

function buildTranslationFilter(
  name: string,
  enabled: boolean,
  current: SiteSettings["homeTranslationFilter"],
  allNames: string[],
): SiteSettings["homeTranslationFilter"] {
  const total = allNames.length;
  if (total === 0) return null;

  const currentSet =
    current === null ? new Set(allNames) : new Set(current.filter((item) => allNames.includes(item)));

  if (enabled) {
    currentSet.add(name);
  } else {
    currentSet.delete(name);
  }

  if (currentSet.size >= total) return null;
  if (currentSet.size === 0) return [];
  return allNames.filter((item) => currentSet.has(item));
}

async function fetchRemoteSiteSettings(): Promise<SiteSettings | null> {
  const res = await fetch("/api/user/site-settings", { cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load site settings");
  const data = (await res.json()) as { settings: SiteSettings | null };
  return data.settings ? normalizeSiteSettings(data.settings) : null;
}

async function saveRemoteSiteSettings(settings: SiteSettings): Promise<void> {
  const res = await fetch("/api/user/site-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok && res.status !== 401) {
    throw new Error("Failed to save site settings");
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const settingsRef = useRef<SiteSettings>(DEFAULT_SITE_SETTINGS);

  const scheduleRemoteSave = useCallback(
    (next: SiteSettings) => {
      if (!user) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        void saveRemoteSiteSettings(next);
      }, REMOTE_SAVE_DELAY_MS);
    },
    [user],
  );

  const commitSettings = useCallback(
    (next: SiteSettings, syncRemote = true) => {
      const normalized = normalizeSiteSettings(next);
      settingsRef.current = normalized;
      setSettings(normalized);
      applySiteSettings(normalized);
      if (syncRemote) {
        scheduleRemoteSave(normalized);
      }
      return normalized;
    },
    [scheduleRemoteSave],
  );

  useEffect(() => {
    const stored = readStoredSiteSettings();
    settingsRef.current = stored;
    setSettings(stored);
    applySiteSettings(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!user && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [user]);

  useEffect(() => {
    if (!hydrated || authLoading || !user) {
      if (!user) syncedUserIdRef.current = null;
      return;
    }
    if (syncedUserIdRef.current === user.id) return;

    let cancelled = false;

    void (async () => {
      try {
        const remote = await fetchRemoteSiteSettings();
        if (cancelled) return;

        syncedUserIdRef.current = user.id;

        if (remote) {
          commitSettings(remote, false);
          return;
        }

        const local = readStoredSiteSettings();
        await saveRemoteSiteSettings(local);
      } catch {
        if (!cancelled) syncedUserIdRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, commitSettings, hydrated, user]);

  const updateSettings = useCallback(
    (patch: Partial<SiteSettings>) => {
      setSettings((current) => commitSettings({ ...current, ...patch }));
    },
    [commitSettings],
  );

  const resetSettings = useCallback(() => {
    commitSettings({ ...DEFAULT_SITE_SETTINGS });
  }, [commitSettings]);

  const toggleTranslationOnHome = useCallback(
    (name: string, enabled: boolean, allNames: string[]) => {
      const current = settingsRef.current;
      const nextFilter = buildTranslationFilter(name, enabled, current.homeTranslationFilter, allNames);
      commitSettings({ ...current, homeTranslationFilter: nextFilter });
    },
    [commitSettings],
  );

  const setAllHomeTranslations = useCallback(
    (enabled: boolean, _allNames?: string[]) => {
      const current = settingsRef.current;
      commitSettings({
        ...current,
        homeTranslationFilter: enabled ? null : [],
      });
    },
    [commitSettings],
  );

  const setPopularHomeTranslations = useCallback(
    (allNames: string[]) => {
      const current = settingsRef.current;
      commitSettings({
        ...current,
        homeTranslationFilter: buildPopularHomeTranslationFilter(allNames),
      });
    },
    [commitSettings],
  );

  const value = useMemo<SiteSettingsContextValue>(
    () => ({
      settings: hydrated ? settings : DEFAULT_SITE_SETTINGS,
      updateSettings,
      resetSettings,
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      toggleTranslationOnHome,
      setAllHomeTranslations,
      setPopularHomeTranslations,
    }),
    [
      hydrated,
      settings,
      updateSettings,
      resetSettings,
      settingsOpen,
      toggleTranslationOnHome,
      setAllHomeTranslations,
      setPopularHomeTranslations,
    ],
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsContextValue {
  const value = useContext(SiteSettingsContext);
  if (!value) {
    throw new Error("useSiteSettings must be used within SiteSettingsProvider");
  }
  return value;
}
