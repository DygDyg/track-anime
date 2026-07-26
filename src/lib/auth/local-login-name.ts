const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Транслитерация предложения, не идентификатор Shikimori и не отображаемое имя. */
export function normalizeLocalLogin(value: string): string {
  return value.trim().toLowerCase().split("").map((char) => CYRILLIC_TO_LATIN[char] ?? char).join("")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "_")
    .replace(/[_-]{2,}/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 32);
}
