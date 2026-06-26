import { writeFileSync } from "node:fs";

const palettes = [
  ["anilib", 67, 160, 71],
  ["anidub", 229, 57, 53],
  ["animevost", 142, 36, 170],
  ["anistar", 30, 136, 229],
  ["crunchyroll", 244, 117, 33],
  ["anibaza", 0, 137, 123],
  ["animy", 158, 157, 36],
  ["dream-cast", 255, 179, 0],
  ["jam", 236, 64, 122],
  ["shiza", 123, 31, 162],
  ["fumodub", 255, 112, 67],
  ["animaunt", 0, 172, 193],
  ["kazoku", 57, 73, 171],
  ["red-head", 198, 40, 40],
  ["onwave", 41, 182, 246],
  ["silver-aniage", 120, 144, 156],
  ["todo-dublyazh", 251, 140, 0],
  ["komnata-didi", 253, 216, 53],
  ["anicosmic", 92, 107, 192],
  ["fsg-sanae", 38, 166, 154],
  ["anifilm", 63, 81, 181],
  ["studio-band", 171, 71, 188],
  ["reanimedia", 173, 20, 87],
  ["youkai", 126, 87, 194],
  ["flowers-media", 102, 187, 106],
  ["ogurcik", 124, 179, 66],
  ["blackcat", 66, 66, 66],
  ["heat-sound", 255, 87, 34],
  ["calliope", 186, 104, 200],
  ["new-horizons", 3, 169, 244],
  ["mda", 96, 125, 139],
  ["deep", 69, 90, 100],
  ["dublirovan", 141, 110, 99],
  ["subtitles", 144, 164, 174],
];

function colors(r, g, b, theme) {
  if (theme === "dark") {
    return {
      bg: `rgba(${r}, ${g}, ${b}, 0.16)`,
      text: `rgb(${Math.min(r + 70, 255)}, ${Math.min(g + 70, 255)}, ${Math.min(b + 70, 255)})`,
      border: `rgba(${r}, ${g}, ${b}, 0.42)`,
      active: `rgba(${r}, ${g}, ${b}, 0.28)`,
    };
  }
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.1)`,
    text: `rgb(${Math.max(r - 40, 0)}, ${Math.max(g - 40, 0)}, ${Math.max(b - 40, 0)})`,
    border: `rgba(${r}, ${g}, ${b}, 0.32)`,
    active: `rgba(${r}, ${g}, ${b}, 0.2)`,
  };
}

let css =
  "/* Studio badge colors — regenerate: node scripts/generate-translation-badges-css.mjs */\n";
css += ".translation-badge, .translation-btn[data-studio] { border-width: 1px; border-style: solid; }\n";

for (const [id, r, g, b] of palettes) {
  const d = colors(r, g, b, "dark");
  const l = colors(r, g, b, "light");

  css += `html[data-theme="dark"] .translation-badge[data-studio="${id}"], .translation-badge[data-studio="${id}"] { background-color:${d.bg}; color:${d.text}; border-color:${d.border}; }\n`;
  css += `html[data-theme="light"] .translation-badge[data-studio="${id}"] { background-color:${l.bg}; color:${l.text}; border-color:${l.border}; }\n`;
  css += `html[data-theme="dark"] .translation-btn[data-studio="${id}"], .translation-btn[data-studio="${id}"] { background-color:${d.bg}; color:${d.text}; border-color:${d.border}; }\n`;
  css += `html[data-theme="light"] .translation-btn[data-studio="${id}"] { background-color:${l.bg}; color:${l.text}; border-color:${l.border}; }\n`;
  css += `html[data-theme="dark"] .translation-btn[data-studio="${id}"].translation-btn--active, .translation-btn[data-studio="${id}"].translation-btn--active { background-color:${d.active}; }\n`;
  css += `html[data-theme="light"] .translation-btn[data-studio="${id}"].translation-btn--active { background-color:${l.active}; }\n`;
}

writeFileSync("src/app/translation-badges.css", css);
console.log(`Wrote src/app/translation-badges.css (${css.length} bytes)`);
