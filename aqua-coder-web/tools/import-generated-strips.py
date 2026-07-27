#!/usr/bin/env python3
"""Turn six-cell chroma-key strips into normalized transparent animation frames."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


KEY = (0, 255, 0)


def alpha_from_green(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, _ = pixels[x, y]
            # Keep blue/cyan hair but smoothly remove pixels close to the green key.
            distance = ((red - KEY[0]) ** 2 + (green - KEY[1]) ** 2 + (blue - KEY[2]) ** 2) ** 0.5
            alpha = max(0, min(255, round((distance - 32) * 2.3)))
            if alpha < 255:
                pixels[x, y] = (red, green, blue, alpha)
    return source


def crop_to_canvas(cell: Image.Image, size: tuple[int, int]) -> Image.Image:
    alpha = cell.getchannel("A")
    # Generator strips sometimes leave a sliver of the neighbouring cell at an edge.
    # Retain the largest connected opaque area: it is always the character itself.
    mask = alpha.point(lambda value: 255 if value > 32 else 0)
    width, height = mask.size
    pixels = mask.load()
    seen: set[tuple[int, int]] = set()
    largest: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    if largest:
        keep = Image.new("L", cell.size, 0)
        keep_pixels = keep.load()
        for x, y in largest:
            keep_pixels[x, y] = 255
        cell.putalpha(keep)
    bounds = cell.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("Generated frame is empty after key removal")
    subject = cell.crop(bounds)
    max_width, max_height = size[0] - 12, size[1] - 12
    scale = min(max_width / subject.width, max_height / subject.height)
    resized = subject.resize((round(subject.width * scale), round(subject.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size[0] - resized.width) // 2, size[1] - resized.height - 5))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--frames", type=int, default=6)
    parser.add_argument("--width", type=int, default=192)
    parser.add_argument("--height", type=int, default=208)
    parser.add_argument("--overlap", type=int, default=0, help="Extra source pixels on both cell sides for wide poses")
    args = parser.parse_args()

    strip = alpha_from_green(Image.open(args.input))
    cell_width = strip.width // args.frames
    args.output.mkdir(parents=True, exist_ok=True)
    for index in range(args.frames):
        left = max(0, index * cell_width - args.overlap // 2)
        right = min(strip.width, (index + 1) * cell_width + args.overlap // 2)
        cell = strip.crop((left, 0, right, strip.height))
        crop_to_canvas(cell, (args.width, args.height)).save(args.output / f"{index:02d}.png")


if __name__ == "__main__":
    main()
