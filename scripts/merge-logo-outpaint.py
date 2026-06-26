"""Merge outpainted logo with original center and restore transparency."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
BACKUP_PATH = ROOT / "public" / "logo-before-outpaint.png"
OUTPAINTED = ROOT / "tmp" / "imagegen" / "logo-outpaint-result.png"
META = ROOT / "tmp" / "imagegen" / "logo-outpaint-meta.txt"


def read_meta() -> dict[str, int]:
    data: dict[str, int] = {}
    for line in META.read_text(encoding="utf-8").splitlines():
        key, value = line.split("=", 1)
        data[key] = int(value) if value.isdigit() else value
    return data


def main() -> None:
    if not OUTPAINTED.exists():
        raise SystemExit(f"Missing outpainted result: {OUTPAINTED}")

    meta = read_meta()
    pad_left = int(meta["pad_left"])
    pad_right = int(meta["pad_right"])
    pad_top = int(meta["pad_top"])
    pad_bottom = int(meta["pad_bottom"])
    scale = int(meta["scale"])

    original = Image.open(LOGO_PATH).convert("RGBA")
    edited = Image.open(OUTPAINTED).convert("RGBA")

    src_w, src_h = original.size
    target_w = src_w + pad_left + pad_right
    target_h = src_h + pad_top + pad_bottom

    if edited.size != (target_w * scale, target_h * scale):
        edited = edited.resize((target_w * scale, target_h * scale), Image.Resampling.LANCZOS)

    if scale != 1:
        edited = edited.resize((target_w, target_h), Image.Resampling.LANCZOS)

    if not BACKUP_PATH.exists():
        BACKUP_PATH.write_bytes(LOGO_PATH.read_bytes())

    merged = edited.copy()
    merged.paste(original, (pad_left, pad_top), original)

    rgba = np.array(merged, dtype=np.float32)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    lum = r + g + b
    max_rgb = np.maximum(np.maximum(r, g), b)
    bg_like = (lum < 150) & (b >= r - 10) & (b >= g - 10) & (max_rgb < 100)
    alpha = np.where(bg_like, 0, np.maximum(a, 255))
    alpha = np.where(alpha < 24, 0, alpha)
    alpha = np.where(alpha > 235, 255, alpha)
    rgba[..., 3] = alpha

    result = Image.fromarray(rgba.astype(np.uint8), mode="RGBA")
    result.save(LOGO_PATH, format="PNG", optimize=True)

    preview = result.copy()
    preview_path = ROOT / "public" / "logo-extended-preview.png"
    preview.convert("RGB").save(preview_path, format="PNG", optimize=True)

    print(f"Saved extended logo: {LOGO_PATH} ({result.size[0]}x{result.size[1]})")
    print(f"Preview on dark bg: {preview_path}")


if __name__ == "__main__":
    main()
