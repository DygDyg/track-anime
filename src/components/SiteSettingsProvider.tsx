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
  hasStoredSiteSettings,
  mergeRemoteWithLocalSiteSettings,
  normalizeSiteSettings,
  readStoredSiteSettings,
  stripLocalOnlySiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

type SiteSettingsContextValue = {
  settings: SiteSettings;
  remoteSaving: boolean;
  updateSettings: (patch: Partial<SiteSettings>) => void;
  updateLocalSettings: (patch: Partial<SiteSettings>) => void;
  resetSettings: () => void;
  settingsOpen: boolean;
  settingsInitialTab: "notifications" | null;
  openSettings: (tab?: "notifications") => void;
  closeSettings: () => void;
  clearSettingsInitialTab: () => void;
  toggleTranslationOnHome: (name: string, enabled: boolean, allNames: string[]) => void;
  setAllHomeTranslations: (enabled: boolean, allNames: string[]) => void;
  setPopularHomeTranslations: (allNames: string[]) => void;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

const REMOTE_SAVE_DELAY_MS = 500;

function buildSelectionFilter(
  value: string,
  enabled: boolean,
  current: string[] | null,
  allValues: string[],
): string[] | null {
  const total = allValues.length;
  if (total === 0) return null;

  const currentSet =
    current === null ? new Set(allValues) : new Set(current.filter((item) => allValues.includes(item)));

  if (enabled) {
    currentSet.add(value);
  } else {
    currentSet.delete(value);
  }

  if (currentSet.size >= total) return null;
  if (currentSet.size === 0) return [];
  return allValues.filter((item) => currentSet.has(item));
}

function buildTranslationFilter(
  name: string,
  enabled: boolean,
  current: SiteSettings["homeTranslationFilter"],
  allNames: string[],
): SiteSettings["homeTranslationFilter"] {
  return buildSelectionFilter(name, enabled, current, allNames);
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
    body: JSON.stringify(stripLocalOnlySiteSettings(settings)),
  });
  if (!res.ok && res.status !== 401) {
    throw new Error("Failed to save site settings");
  }
}

export function SiteSettingsProvider({
  children,
  defaults = DEFAULT_SITE_SETTINGS,
}: {
  children: ReactNode;
  defaults?: SiteSettings;
}) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SiteSettings>(defaults);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"notifications" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [remoteSaving, setRemoteSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(0);
  const syncedUserIdRef = useRef<string | null>(null);
  const settingsRef = useRef<SiteSettings>(defaults);
  const defaultsRef = useRef<SiteSettings>(defaults);

  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);

  const scheduleRemoteSave = useCallback(
    (next: SiteSettings) => {
      if (!user) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveInFlightRef.current += 1;
        setRemoteSaving(true);
        void saveRemoteSiteSettings(next)
          .catch(() => undefined)
          .finally(() => {
            saveInFlightRef.current = Math.max(0, saveInFlightRef.current - 1);
            if (saveInFlightRef.current === 0) {
              setRemoteSaving(false);
            }
          });
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
    const initial = hasStoredSiteSettings()
      ? readStoredSiteSettings(defaultsRef.current)
      : { ...defaultsRef.current };
    settingsRef.current = initial;
    setSettings(initial);
    applySiteSettings(initial);
    setHydrated(true);
  }, [defaults]);

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
          commitSettings(
            mergeRemoteWithLocalSiteSettings(remote, settingsRef.current),
            false,
          );
          return;
        }

        const local = hasStoredSiteSettings()
          ? readStoredSiteSettings(defaultsRef.current)
          : { ...defaultsRef.current };
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

  const updateLocalSettings = useCallback(
    (patch: Partial<SiteSettings>) => {
      setSettings((current) => commitSettings({ ...current, ...patch }, false));
    },
    [commitSettings],
  );

  const resetSettings = useCallback(() => {
    commitSettings({ ...defaultsRef.current });
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const settingsParam = params.get("settings");

    if (settingsParam === "notifications") {
      setSettingsOpen(true);
      setSettingsInitialTab("notifications");
      params.delete("settings");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  const value = useMemo<SiteSettingsContextValue>(
    () => ({
      settings: hydrated ? settings : defaults,
      remoteSaving,
      updateSettings,
      updateLocalSettings,
      resetSettings,
      settingsOpen,
      settingsInitialTab,
      openSettings: (tab) => {
        if (tab) setSettingsInitialTab(tab);
        setSettingsOpen(true);
      },
      closeSettings: () => setSettingsOpen(false),
      clearSettingsInitialTab: () => setSettingsInitialTab(null),
      toggleTranslationOnHome,
      setAllHomeTranslations,
      setPopularHomeTranslations,
    }),
    [
      hydrated,
      settings,
      defaults,
      remoteSaving,
      updateSettings,
      updateLocalSettings,
      resetSettings,
      settingsOpen,
      settingsInitialTab,
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
