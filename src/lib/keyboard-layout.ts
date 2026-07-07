const LAYOUT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["`", "ё"],
  ["q", "й"],
  ["w", "ц"],
  ["e", "у"],
  ["r", "к"],
  ["t", "е"],
  ["y", "н"],
  ["u", "г"],
  ["i", "ш"],
  ["o", "щ"],
  ["p", "з"],
  ["[", "х"],
  ["]", "ъ"],
  ["a", "ф"],
  ["s", "ы"],
  ["d", "в"],
  ["f", "а"],
  ["g", "п"],
  ["h", "р"],
  ["j", "о"],
  ["k", "л"],
  ["l", "д"],
  [";", "ж"],
  ["'", "э"],
  ["z", "я"],
  ["x", "ч"],
  ["c", "с"],
  ["v", "м"],
  ["b", "и"],
  ["n", "т"],
  ["m", "ь"],
  [",", "б"],
  [".", "ю"],
  ["/", "."],
];

const LAYOUT_MAP = new Map<string, string>();

for (const [en, ru] of LAYOUT_PAIRS) {
  LAYOUT_MAP.set(en, ru);
  LAYOUT_MAP.set(ru, en);
  LAYOUT_MAP.set(en.toUpperCase(), ru.toUpperCase());
  LAYOUT_MAP.set(ru.toUpperCase(), en.toUpperCase());
}

const LETTER_RE = /[a-zA-Zа-яА-ЯёЁ]/;

/** Меняет раскладку QWERTY ↔ ЙЦУКЕН посимвольно; неизвестные символы не трогает. */
export function switchKeyboardLayout(text: string): string {
  return Array.from(text, (char) => LAYOUT_MAP.get(char) ?? char).join("");
}

/** Альтернативный запрос, если в строке есть буквы другой раскладки; иначе null. */
export function getAlternateKeyboardLayoutQuery(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const switched = switchKeyboardLayout(trimmed);
  if (switched === trimmed) return null;

  const hasMappedLetter = Array.from(trimmed).some(
    (char, index) => char !== switched[index] && LETTER_RE.test(char),
  );

  return hasMappedLetter ? switched : null;
}
