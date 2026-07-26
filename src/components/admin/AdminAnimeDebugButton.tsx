"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Props = {
  shikimoriId?: number | null;
  materialId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  compact?: boolean;
};

type JsonMode = "tree" | "text";

const JSON_TOKEN_RE = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;

function jsonPath(parent: string, key: string | number): string {
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}[${JSON.stringify(key)}]`;
}

function valueMatches(value: unknown, key: string | number | null, query: string): boolean {
  if (!query) return false;
  const isContainer = Array.isArray(value) || (value !== null && typeof value === "object");
  const valueText = isContainer ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const haystack = `${key == null ? "" : String(key)} ${valueText}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function findJsonMatchPaths(value: unknown, query: string, path = "$", key: string | number | null = null): string[] {
  const matches = valueMatches(value, key, query) ? [path] : [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => matches.push(...findJsonMatchPaths(item, query, jsonPath(path, index), index)));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, child]) => {
      matches.push(...findJsonMatchPaths(child, query, jsonPath(path, childKey), childKey));
    });
  }
  return matches;
}

function JsonTree({
  value,
  query,
  selectedPath,
  onSelect,
  nodeRefs,
}: {
  value: unknown;
  query: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  nodeRefs: MutableRefObject<Map<string, HTMLElement>>;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const renderNode = (current: unknown, path: string, label?: string | number): ReactNode => {
    const isContainer = Array.isArray(current) || (current !== null && typeof current === "object");
    const isCollapsed = collapsed.has(path);
    const matches = valueMatches(current, label ?? null, query);
    const isSelected = selectedPath === path;
    const labelNode = label === undefined ? null : <span className="text-sky-300">{JSON.stringify(String(label))}: </span>;

    if (!isContainer) {
      const rendered = current === null ? "null" : typeof current === "string" ? JSON.stringify(current) : String(current);
      const color = current === null ? "text-fuchsia-300" : typeof current === "string" ? "text-emerald-300" : typeof current === "boolean" ? "text-amber-300" : "text-violet-300";
      return (
        <div
          ref={(element) => { if (element) nodeRefs.current.set(path, element); }}
          data-json-path={path}
          onClick={() => onSelect(path)}
          className={["cursor-pointer rounded px-1", matches ? "bg-amber-400/20" : "", isSelected ? "ring-1 ring-accent bg-accent/15" : ""].join(" ")}
        >
          {labelNode}<span className={color}>{rendered}</span>
        </div>
      );
    }

    const entries = Array.isArray(current) ? current.map((item, index) => [index, item] as const) : Object.entries(current as Record<string, unknown>);
    const marker = Array.isArray(current) ? `[${entries.length}]` : `{${entries.length}}`;
    return (
      <div
        ref={(element) => { if (element) nodeRefs.current.set(path, element); }}
        data-json-path={path}
        className={["rounded px-1", matches ? "bg-amber-400/20" : "", isSelected ? "ring-1 ring-accent bg-accent/15" : ""].join(" ")}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((previous) => {
              const next = new Set(previous);
              if (next.has(path)) next.delete(path); else next.add(path);
              return next;
            });
          }}
          className="mr-1 text-muted hover:text-foreground"
          aria-label={isCollapsed ? "Развернуть" : "Свернуть"}
        >
          {isCollapsed ? "▸" : "▾"}
        </button>
        <button type="button" onClick={() => onSelect(path)} className="text-left hover:text-foreground">
          {labelNode}<span className="text-muted">{isCollapsed ? marker : Array.isArray(current) ? "[" : "{"}</span>
        </button>
        {!isCollapsed ? (
          <div className="ml-4 border-l border-white/10 pl-2">
            {entries.map(([childKey, child]) => <div key={String(childKey)}>{renderNode(child, jsonPath(path, childKey), childKey)}</div>)}
            <div className="text-muted">{Array.isArray(current) ? "]" : "}"}</div>
          </div>
        ) : null}
      </div>
    );
  };

  return <div className="font-mono text-xs leading-5">{renderNode(value, "$")}</div>;
}

function JsonText({ raw, query, activeMatch, markRefs }: { raw: string; query: string; activeMatch: number; markRefs: MutableRefObject<Map<number, HTMLElement>> }) {
  let matchIndex = 0;
  const renderPart = (text: string, className = "") => {
    if (!query) return <span className={className}>{text}</span>;
    const pieces = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return pieces.map((piece, index) => {
      if (piece.toLowerCase() !== query.toLowerCase()) return <span key={index} className={className}>{piece}</span>;
      const indexInAllMatches = matchIndex++;
      return <mark key={index} ref={(element) => { if (element) markRefs.current.set(indexInAllMatches, element); }} className={indexInAllMatches === activeMatch ? "bg-orange-400 text-black" : "bg-amber-300/65 text-black"}>{piece}</mark>;
    });
  };

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of raw.matchAll(JSON_TOKEN_RE)) {
    if (match.index! > lastIndex) nodes.push(renderPart(raw.slice(lastIndex, match.index)));
    const className = match[1] ? "text-sky-300" : match[2] ? "text-emerald-300" : match[3] ? "text-amber-300" : match[4] ? "text-fuchsia-300" : "text-violet-300";
    nodes.push(renderPart(match[0], className));
    lastIndex = match.index! + match[0].length;
  }
  if (lastIndex < raw.length) nodes.push(renderPart(raw.slice(lastIndex)));
  return <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">{nodes}</pre>;
}

export function AdminAnimeDebugButton({ shikimoriId, materialId, seasonNumber, episodeNumber, compact = false }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<JsonMode>("tree");
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const textMatchRefs = useRef(new Map<number, HTMLElement>());
  const treeNodeRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => setMounted(true), []);
  const raw = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);
  const matchPaths = useMemo(() => (data && query ? findJsonMatchPaths(data, query) : []), [data, query]);
  const textMatchCount = useMemo(() => query ? raw.toLowerCase().split(query.toLowerCase()).length - 1 : 0, [query, raw]);
  const matchCount = mode === "tree" ? matchPaths.length : textMatchCount;

  useEffect(() => { setActiveMatch(0); }, [query, mode]);
  useEffect(() => {
    if (!query || matchCount === 0) return;
    if (mode === "tree") {
      const path = matchPaths[activeMatch % matchPaths.length];
      if (!path) return;
      setSelectedPath(path);
      window.setTimeout(() => treeNodeRefs.current.get(path)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
      return;
    }
    window.setTimeout(() => textMatchRefs.current.get(activeMatch % textMatchCount)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
  }, [activeMatch, matchCount, matchPaths, mode, query, textMatchCount]);

  if (!user?.isAdmin || (!shikimoriId && !materialId)) return null;

  const openDebug = async () => {
    setOpen(true); setLoading(true); setError(null); setData(null); setSelectedPath(null);
    try {
      const params = new URLSearchParams();
      if (shikimoriId) params.set("shikimoriId", String(shikimoriId));
      if (materialId) params.set("materialId", materialId);
      if (seasonNumber) params.set("seasonNumber", String(seasonNumber));
      if (episodeNumber) params.set("episodeNumber", String(episodeNumber));
      const response = await fetch(`/api/admin/anime-debug?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as unknown;
      if (!response.ok) throw new Error("Не удалось загрузить диагностику");
      setData(payload);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить диагностику"); }
    finally { setLoading(false); }
  };

  const modal = open ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Диагностика аниме" onClick={(event) => event.stopPropagation()} className="flex h-[min(92dvh,58rem)] w-full max-w-6xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div><h2 className="font-semibold text-foreground">Данные аниме в базе</h2><p className="text-xs text-muted">Kodik, кэш Shikimori, релизы, MAL и AniSkip.</p></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground">×</button>
        </div>
        {data ? <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по JSON…" className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent" />
          <button type="button" disabled={!matchCount} onClick={() => setActiveMatch((value) => (value - 1 + matchCount) % matchCount)} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40">↑</button>
          <button type="button" disabled={!matchCount} onClick={() => setActiveMatch((value) => (value + 1) % matchCount)} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40">↓</button>
          <span className="text-xs text-muted">{query ? `${matchCount ? `${activeMatch + 1} / ${matchCount}` : "нет совпадений"}` : ""}</span>
          <button type="button" onClick={() => setMode("tree")} className={mode === "tree" ? "rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent" : "rounded border border-border px-2 py-1 text-xs"}>Дерево</button>
          <button type="button" onClick={() => setMode("text")} className={mode === "text" ? "rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent" : "rounded border border-border px-2 py-1 text-xs"}>Текст</button>
        </div> : null}
        <div className="border-b border-border px-4 py-1.5 text-xs text-muted">Путь: <code className="text-foreground">{selectedPath ?? "—"}</code></div>
        <div className="min-h-0 overflow-auto p-4">{loading ? <div className="flex justify-center py-12"><LoadingSpinner /></div> : null}{error ? <p className="text-sm text-red-400">{error}</p> : null}{data ? <div className="rounded-lg bg-black/35 p-3">{mode === "tree" ? <JsonTree value={data} query={query} selectedPath={selectedPath} onSelect={setSelectedPath} nodeRefs={treeNodeRefs} /> : <JsonText raw={raw} query={query} activeMatch={activeMatch} markRefs={textMatchRefs} />}</div> : null}</div>
      </div>
    </div>
  ) : null;

  return <><button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openDebug(); }} className={compact ? "rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20" : "mt-3 inline-flex rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"}>Данные в БД</button>{mounted && modal ? createPortal(modal, document.body) : null}</>;
}
