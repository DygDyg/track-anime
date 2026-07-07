import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { AVATAR_DECORATION_IDS } from "../src/lib/avatar-decorations";

const SRC_DIR = path.join(process.cwd(), "public", "avatar-decorations");
const THUMB_DIR = path.join(SRC_DIR, "thumbs");
const DISPLAY_DIR = path.join(SRC_DIR, "display");

async function main() {
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(DISPLAY_DIR, { recursive: true });

  for (const id of AVATAR_DECORATION_IDS) {
    const input = path.join(SRC_DIR, `${id}.png`);
    try {
      await fs.access(input);
    } catch {
      console.warn(`skip missing: ${id}.png`);
      continue;
    }

    const thumbOut = path.join(THUMB_DIR, `${id}.webp`);
    const displayOut = path.join(DISPLAY_DIR, `${id}.webp`);

    await sharp(input)
      .resize(96, 96, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumbOut);

    await sharp(input)
      .resize(384, 384, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(displayOut);

    const [thumbStat, displayStat] = await Promise.all([fs.stat(thumbOut), fs.stat(displayOut)]);
    console.log(`${id}: thumb ${Math.round(thumbStat.size / 1024)}KB, display ${Math.round(displayStat.size / 1024)}KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
