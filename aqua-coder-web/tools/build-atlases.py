#!/usr/bin/env python3
"""Build transparent WebP sprite atlases from numbered PNG frames."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def load_frames(directory: Path) -> list[Path]:
    frames = sorted(directory.glob("*.png"))
    if not frames:
        raise ValueError(f"No PNG frames in {directory}")
    return frames


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Directory containing one subdirectory per animation")
    parser.add_argument("--output", type=Path, required=True, help="Character public directory; sprites go to sprites/")
    parser.add_argument("--manifest", type=Path, required=True, help="Manifest template to update")
    parser.add_argument("--quality", type=int, default=92)
    parser.add_argument("--scale", type=int, default=1, help="Integer export multiplier; does not create new detail")
    parser.add_argument("--only", nargs="+", help="Optional animation names to rebuild; useful when adding one new state")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    sprites = args.output / "sprites"
    sprites.mkdir(parents=True, exist_ok=True)

    wanted = set(args.only) if args.only else set(manifest["animations"])
    unknown = wanted.difference(manifest["animations"])
    if unknown:
        raise ValueError(f"Unknown animation names: {', '.join(sorted(unknown))}")

    for name, definition in manifest["animations"].items():
        if name not in wanted:
            continue
        frame_dir = args.source / name
        frames = load_frames(frame_dir)
        first = Image.open(frames[0]).convert("RGBA")
        native_width, native_height = first.size
        width, height = native_width * args.scale, native_height * args.scale
        atlas = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
        for index, path in enumerate(frames):
            image = Image.open(path).convert("RGBA")
            if image.size != (native_width, native_height):
                raise ValueError(f"Inconsistent frame size in {frame_dir}: {path.name}")
            if args.scale > 1:
                image = image.resize((width, height), Image.Resampling.LANCZOS)
            atlas.alpha_composite(image, (index * width, 0))
        target = sprites / Path(definition["image"]).name
        atlas.save(target, "WEBP", lossless=True, quality=args.quality, method=6)
        definition.update({"frameWidth": width, "frameHeight": height, "frames": len(frames), "columns": len(frames)})

    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
