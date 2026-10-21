import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  PROFILE_FRAMES,
  type ProfileFrameLayer,
  type ProfileFramePlacement,
} from "../src/lib/profile-frames";

const SRC_ROOT =
  process.env.PROFILE_FRAMES_SRC ??
  path.join(process.env.USERPROFILE ?? "", "Downloads", "рамка профиля");

const OUT_ROOT = path.join(process.cwd(), "public", "profile-frames");
const LAYER_WIDTH = 960;
const THUMB_WIDTH = 280;

const SOURCE_FILES: Record<string, { dir: string; files: Record<string, string> }> = {
  jade: {
    dir: "Jade",
    files: {
      glow: "dragon-jade-glow.png",
      head: "dragon-jade-head.png",
      sides: "dragon-jade-sides.png",
      tail: "dragon-jade-tail.png",
      top: "dragon-jade-top.png",
    },
  },
  rose: {
    dir: "Rose",
    files: {
      glow: "dragon-rose-glow.png",
      head: "dragon-rose-head.png",
      sides: "dragon-rose-sides.png",
      tail: "dragon-rose-tail.png",
      top: "dragon-rose-top.png",
    },
  },
  ruby: {
    dir: "Ruby",
    files: {
      glow: "dragon-ruby-glow.png",
      head: "dragon-ruby-head.png",
      sides: "dragon-ruby-sides.png",
      tail: "dragon-ruby-tail.png",
      top: "dragon-ruby-top.png",
    },
  },
  sapphire: {
    dir: "Sapphire",
    files: {
      glow: "dragon-sapphire-glow.png",
      head: "dragon-sapphire-head.png",
      sides: "dragon-sapphire-sides.png",
      tail: "dragon-sapphire-tail.png",
      top: "dragon-sapphire-top.png",
    },
  },
  pda: {
    dir: "PDA",
    files: {
      border: "pda-border.png",
      top: "pda-top.png",
      bottom: "pda-bottom.png",
    },
  },
};

type LayerBuffer = {
  file: string;
  placement: ProfileFramePlacement;
  depth: ProfileFrameLayer["depth"];
  width: number;
  height: number;
  buffer: Buffer;
};

async function loadLayer(
  srcPath: string,
  layer: ProfileFrameLayer,
): Promise<LayerBuffer> {
  const resized = sharp(srcPath).resize({ width: LAYER_WIDTH, withoutEnlargement: true });
  const buffer = await resized.webp({ quality: 82, alphaQuality: 90 }).toBuffer();
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

function layerTop(
  layer: LayerBuffer,
  canvasHeight: number,
  overflowTop: number,
  overflowBottom: number,
  scale: number,
): number {
  const topOutside = Math.round(overflowTop * scale);
  const bottomOutside = Math.round(overflowBottom * scale);
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

async function main() {
  await fs.mkdir(path.join(OUT_ROOT, "thumbs"), { recursive: true });

  for (const frame of PROFILE_FRAMES) {
    const source = SOURCE_FILES[frame.id];
    if (!source) throw new Error(`no source map for ${frame.id}`);

    const layers: LayerBuffer[] = [];
    for (const layer of frame.layers) {
      const fileName = source.files[layer.file];
      if (!fileName) throw new Error(`no source file for ${frame.id}/${layer.file}`);
      const srcPath = path.join(SRC_ROOT, source.dir, fileName);
      layers.push(await loadLayer(srcPath, layer));
    }

    const outDir = path.join(OUT_ROOT, frame.id);
    await fs.mkdir(outDir, { recursive: true });
    for (const layer of layers) {
      await fs.writeFile(path.join(outDir, `${layer.file}.webp`), layer.buffer);
    }

    // Thumb canvas ≈ Discord: content + overflow, art width = design + 2*overflowX
    const artWidth = frame.designWidth + frame.overflowX * 2;
    const scale = LAYER_WIDTH / artWidth;
    const contentHeight = Math.round((frame.designWidth * 1.55) * scale); // approx card aspect for thumb
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
      let top = layerTop(layer, canvasHeight, frame.overflowTop, frame.overflowBottom, scale);

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

    const thumbPath = path.join(OUT_ROOT, "thumbs", `${frame.id}.webp`);
    await sharp(canvasBuf)
      .resize({ width: THUMB_WIDTH })
      .webp({ quality: 78, alphaQuality: 90 })
      .toFile(thumbPath);

    const thumbStat = await fs.stat(thumbPath);
    console.log(
      `${frame.id}: canvas ${canvasWidth}x${canvasHeight}, thumb ${Math.round(thumbStat.size / 1024)}KB`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
