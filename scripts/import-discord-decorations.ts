/**
 * Импорт Discord collectibles из локальной папки scrap'а в public/ + data/*.json.
 *
 *   DISCORD_DECORATIONS_SRC=C:\Users\dygdy\Projects\discord-profile-frame npm run discord-decorations:import
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const SRC_ROOT =
  process.env.DISCORD_DECORATIONS_SRC ??
  path.join(process.env.USERPROFILE ?? "", "Projects", "discord-profile-frame");

const REPO = process.cwd();
const FRAMES_OUT = path.join(REPO, "public", "profile-frames");
const AVATARS_OUT = path.join(REPO, "public", "avatar-decorations");
const FRAMES_JSON = path.join(REPO, "data", "discord-profile-frames.json");
const AVATARS_JSON = path.join(REPO, "data", "discord-avatar-decorations.json");

const LAYER_WIDTH = 960;
const THUMB_WIDTH = 280;
const AVATAR_THUMB = 96;
const AVATAR_DISPLAY = 384;

const LEGACY_FRAME_IDS = new Set(["jade", "rose", "ruby", "sapphire", "pda"]);

const FRAME_LAYER_MAP: Record<
  string,
  { file: string; placement: "top" | "bottom" | "rail"; depth: "back" | "front" }
> = {
  "back-top.png": { file: "back-top", placement: "top", depth: "back" },
  "back-bottom.png": { file: "back-bottom", placement: "bottom", depth: "back" },
  "front-top.png": { file: "front-top", placement: "top", depth: "front" },
  "front-bottom.png": { file: "front-bottom", placement: "bottom", depth: "front" },
  "rail.png": { file: "rail", placement: "rail", depth: "back" },
};

/** Overflow helpers reviewed from ollama qwen3_5-9b (ratio 0.45 + floors). */
function computeOverflowTop(Htop: number): number {
  if (Htop === 0) return 304;
  return Math.round(Math.max(250, Htop * 0.45));
}

function computeOverflowBottom(Hbot: number): number {
  if (Hbot === 0) return 212;
  return Math.round(Math.max(180, Hbot * 0.45));
}

type DiscordFrameLayer = {
  file: string;
  placement: "top" | "bottom" | "rail" | "stretch";
  depth: "back" | "front";
};

type DiscordFrameEntry = {
  id: string;
  label: string;
  designWidth: number;
  overflowTop: number;
  overflowBottom: number;
  overflowX: number;
  layers: DiscordFrameLayer[];
};

type LayerBuffer = {
  file: string;
  placement: DiscordFrameLayer["placement"];
  depth: DiscordFrameLayer["depth"];
  width: number;
  height: number;
  buffer: Buffer;
};

async function listSnowflakeDirs(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function detectFrameLayers(
  dir: string,
): Promise<{ layers: DiscordFrameLayer[]; topH: number; bottomH: number } | null> {
  const files = await fs.readdir(dir);
  const layers: DiscordFrameLayer[] = [];
  let topH = 0;
  let bottomH = 0;

  for (const name of files) {
    const mapped = FRAME_LAYER_MAP[name];
    if (!mapped) continue;
    layers.push({ ...mapped });
    const meta = await sharp(path.join(dir, name)).metadata();
    const h = meta.height ?? 0;
    if (mapped.placement === "top") topH = Math.max(topH, h);
    if (mapped.placement === "bottom") bottomH = Math.max(bottomH, h);
  }

  if (layers.length === 0) return null;

  const order = ["back-top", "back-bottom", "rail", "front-top", "front-bottom"];
  layers.sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file));

  return { layers, topH, bottomH };
}

async function loadLayerWebp(srcPath: string, layer: DiscordFrameLayer): Promise<LayerBuffer> {
  const buffer = await sharp(srcPath)
    .resize({ width: LAYER_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    file: layer.file,
    placement: layer.placement,
    depth: layer.depth,
    width: meta.width ?? LAYER_WIDTH,
    height: meta.height ?? LAYER_WIDTH,
    buffer,
  };
}

function layerTopPx(
  layer: LayerBuffer,
  canvasHeight: number,
  overflowTop: number,
  overflowBottom: number,
  scale: number,
): number {
  const topOutside = Math.round(overflowTop * scale);
  switch (layer.placement) {
    case "top":
      return 0;
    case "bottom":
      return Math.max(0, canvasHeight - layer.height);
    case "rail":
    case "stretch":
      return topOutside;
    default:
      return topOutside;
  }
}

async function writeFrameThumb(
  layers: LayerBuffer[],
  frame: DiscordFrameEntry,
  thumbPath: string,
): Promise<void> {
  const artWidth = frame.designWidth + frame.overflowX * 2;
  const scale = LAYER_WIDTH / artWidth;
  const contentHeight = Math.round(frame.designWidth * 1.55 * scale);
  const canvasWidth = LAYER_WIDTH;
  const canvasHeight =
    Math.round(frame.overflowTop * scale) +
    contentHeight +
    Math.round(frame.overflowBottom * scale);

  const depthOrder = { back: 0, front: 1 } as const;
  const ordered = [...layers].sort((a, b) => depthOrder[a.depth] - depthOrder[b.depth]);

  let canvasBuf = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

  for (const layer of ordered) {
    const topOutside = Math.round(frame.overflowTop * scale);
    const contentH = contentHeight;
    let input = layer.buffer;
    let top = layerTopPx(layer, canvasHeight, frame.overflowTop, frame.overflowBottom, scale);

    if (layer.placement === "stretch" || layer.placement === "rail") {
      const h = layer.placement === "stretch" ? contentH : Math.min(layer.height, contentH);
      input = await sharp(layer.buffer)
        .resize(canvasWidth, layer.placement === "stretch" ? contentH : h, {
          fit: layer.placement === "stretch" ? "fill" : "inside",
        })
        .png()
        .toBuffer();
      top = topOutside + (layer.placement === "rail" ? Math.round((contentH - h) / 2) : 0);
    } else if (layer.placement === "top") {
      input = await sharp(layer.buffer).resize({ width: canvasWidth }).png().toBuffer();
      top = 0;
    } else if (layer.placement === "bottom") {
      input = await sharp(layer.buffer).resize({ width: canvasWidth }).png().toBuffer();
      const meta = await sharp(input).metadata();
      top = canvasHeight - (meta.height ?? layer.height);
    }

    canvasBuf = await sharp(canvasBuf).composite([{ input, top, left: 0 }]).png().toBuffer();
  }

  await sharp(canvasBuf)
    .resize({ width: THUMB_WIDTH })
    .webp({ quality: 78, alphaQuality: 90 })
    .toFile(thumbPath);
}

async function importFrames(ids: string[]): Promise<DiscordFrameEntry[]> {
  await fs.mkdir(path.join(FRAMES_OUT, "thumbs"), { recursive: true });
  const catalog: DiscordFrameEntry[] = [];

  for (const id of ids) {
    if (LEGACY_FRAME_IDS.has(id)) continue;
    const dir = path.join(SRC_ROOT, id);
    const detected = await detectFrameLayers(dir);
    if (!detected) continue;

    const entry: DiscordFrameEntry = {
      id,
      label: `Рамка ${id.slice(-4)}`,
      designWidth: 1200,
      overflowTop: computeOverflowTop(detected.topH),
      overflowBottom: computeOverflowBottom(detected.bottomH),
      overflowX: 56,
      layers: detected.layers,
    };

    const outDir = path.join(FRAMES_OUT, id);
    await fs.mkdir(outDir, { recursive: true });

    const buffers: LayerBuffer[] = [];
    for (const layer of entry.layers) {
      const srcName = Object.entries(FRAME_LAYER_MAP).find(([, v]) => v.file === layer.file)?.[0];
      if (!srcName) continue;
      const buf = await loadLayerWebp(path.join(dir, srcName), layer);
      await fs.writeFile(path.join(outDir, `${layer.file}.webp`), buf.buffer);
      buffers.push(buf);
    }

    await writeFrameThumb(buffers, entry, path.join(FRAMES_OUT, "thumbs", `${id}.webp`));
    catalog.push(entry);
    console.log(`frame ${id}: ${entry.layers.map((l) => l.file).join(",")} overflow ${entry.overflowTop}/${entry.overflowBottom}`);
  }

  await fs.writeFile(FRAMES_JSON, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

async function importAvatars(ids: string[]): Promise<string[]> {
  await fs.mkdir(path.join(AVATARS_OUT, "thumbs"), { recursive: true });
  await fs.mkdir(path.join(AVATARS_OUT, "display"), { recursive: true });

  const imported: string[] = [];

  for (const id of ids) {
    const src = path.join(SRC_ROOT, id, `${id}.png`);
    try {
      await fs.access(src);
    } catch {
      continue;
    }

    // Skip if folder also has frame layers (frame assets are not avatar overlays)
    const detected = await detectFrameLayers(path.join(SRC_ROOT, id));
    if (detected) continue;

    const dest = path.join(AVATARS_OUT, `${id}.png`);
    await fs.copyFile(src, dest);

    await sharp(dest)
      .resize(AVATAR_THUMB, AVATAR_THUMB, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(path.join(AVATARS_OUT, "thumbs", `${id}.webp`));

    await sharp(dest)
      .resize(AVATAR_DISPLAY, AVATAR_DISPLAY, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(AVATARS_OUT, "display", `${id}.webp`));

    imported.push(id);
  }

  imported.sort();
  await fs.writeFile(AVATARS_JSON, `${JSON.stringify(imported, null, 2)}\n`, "utf8");
  console.log(`avatars: ${imported.length}`);
  return imported;
}

async function main() {
  console.log(`SRC: ${SRC_ROOT}`);
  const ids = await listSnowflakeDirs(SRC_ROOT);
  console.log(`snowflake dirs: ${ids.length}`);

  const frames = await importFrames(ids);
  const avatars = await importAvatars(ids);

  console.log(`done: frames=${frames.length} avatars=${avatars.length}`);
  console.log(`wrote ${FRAMES_JSON}`);
  console.log(`wrote ${AVATARS_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
