const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Ввод в форме: сохраняет регистр, оставляет только допустимые символы. */
export function sanitizeLocalLoginInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

/** Логин для хранения: сохраняет регистр латиницы, транслитерирует кириллицу. */
export function formatLocalLogin(value: string): string {
  return value
    .trim()
    .split("")
    .map((char) => {
      const mapped = CYRILLIC_TO_LATIN[char.toLowerCase()];
      if (mapped === undefined) return char;
      if (mapped.length === 0) return "";
      if (char !== char.toLowerCase()) {
        return mapped[0].toUpperCase() + mapped.slice(1);
      }
      return mapped;
    })
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/[_-]{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 32);
}

/** Ключ для уникальности и входа: всегда нижний регистр. */
export function normalizeLocalLogin(value: string): string {
  return formatLocalLogin(value).toLowerCase();
}
