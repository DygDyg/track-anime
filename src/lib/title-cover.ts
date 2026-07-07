export function hashTitleSeed(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function titleCoverPalette(title: string): {
  background: string;
  accent: string;
  accentSoft: string;
  shadow: string;
} {
  const hash = hashTitleSeed(title.trim().toLowerCase());
  const hue = hash % 360;
  const hue2 = (hue + 36 + (hash % 40)) % 360;
  return {
    background: `linear-gradient(145deg, hsl(${hue} 46% 30%) 0%, hsl(${hue2} 38% 16%) 100%)`,
    accent: `hsl(${(hue + 18) % 360} 72% 68%)`,
    accentSoft: `hsla(${(hue + 18) % 360}, 72%, 68%, 0.35)`,
    shadow: `hsla(${(hue + 10) % 360}, 55%, 12%, 0.55)`,
  };
}

export function titleCoverPatternVariant(title: string): 0 | 1 | 2 {
  return (hashTitleSeed(title) % 3) as 0 | 1 | 2;
}

/** Разбивает название на 1–4 строки для обложки. */
export function titleCoverLines(title: string, maxLines = 4, compact = false): string[] {
  const maxChars = compact ? 14 : 18;
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const words = normalized.split(" ");
  if (words.length === 1) {
    const word = words[0]!;
    if (word.length <= maxChars) return [word];
    const mid = Math.ceil(word.length / 2);
    return [word.slice(0, mid), word.slice(mid)].filter(Boolean);
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (lines.length >= maxLines && current) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s+$/, "")}…`;
  }

  return lines.slice(0, maxLines);
}

export function titleCoverInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  const first = trimmed.replace(/^[\[\(«"'`]+/, "").trim()[0];
  return first ? first.toLocaleUpperCase("ru-RU") : "?";
}
