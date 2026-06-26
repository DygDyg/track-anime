const RELATION_BADGE_BASE =
  "rounded-md px-2 py-0.5 text-[10px] font-semibold leading-tight shadow-lg shadow-black/55 ring-1 backdrop-blur-[2px]";

/** Непрозрачные бейджи типов связи на постере (Shikimori relation). */
export const RELATION_BADGE_THEMES: Record<string, string> = {
  prequel: `${RELATION_BADGE_BASE} border border-[#2563eb]/90 bg-[#1d4ed8] text-white ring-[#3b82f6]/60`,
  sequel: `${RELATION_BADGE_BASE} border border-[#16a34a]/90 bg-[#15803d] text-white ring-[#22c55e]/60`,
  "full story": `${RELATION_BADGE_BASE} border border-[#7c3aed]/90 bg-[#6d28d9] text-white ring-[#8b5cf6]/60`,
  "parent story": `${RELATION_BADGE_BASE} border border-[#9333ea]/90 bg-[#7e22ce] text-white ring-[#a855f7]/60`,
  "side story": `${RELATION_BADGE_BASE} border border-[#0891b2]/90 bg-[#0e7490] text-white ring-[#06b6d4]/60`,
  summary: `${RELATION_BADGE_BASE} border border-[#64748b]/90 bg-[#475569] text-white ring-[#94a3b8]/50`,
  alternative: `${RELATION_BADGE_BASE} border border-[#ea580c]/90 bg-[#c2410c] text-white ring-[#f97316]/60`,
  "spin-off": `${RELATION_BADGE_BASE} border border-[#db2777]/90 bg-[#be185d] text-white ring-[#ec4899]/60`,
  spin_off: `${RELATION_BADGE_BASE} border border-[#db2777]/90 bg-[#be185d] text-white ring-[#ec4899]/60`,
  character: `${RELATION_BADGE_BASE} border border-[#d97706]/90 bg-[#b45309] text-white ring-[#f59e0b]/60`,
  adaptation: `${RELATION_BADGE_BASE} border border-[#e11d48]/90 bg-[#be123c] text-white ring-[#f43f5e]/60`,
  other: `${RELATION_BADGE_BASE} border border-[#525252]/90 bg-[#404040] text-white ring-[#737373]/50`,
};

const RELATION_BADGE_FALLBACK = RELATION_BADGE_THEMES.other!;

export function relationBadgeClass(relation: string): string {
  const normalized = relation.trim().toLowerCase();
  return RELATION_BADGE_THEMES[normalized] ?? RELATION_BADGE_FALLBACK;
}
