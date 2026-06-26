"""Merge extended borders from AI image while preserving original center pixels."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
BACKUP_PATH = ROOT / "public" / "logo-before-outpaint.png"
AI_PATH = Path(
    r"C:\Users\dygdy\.cursor\projects\d-GitHub-ta-new\assets\logo-extended-ai.png"
)

PAD_LEFT = 72
PAD_RIGHT = 96
PAD_TOP = 16
PAD_BOTTOM = 88
CROP_SHIFT_X = -36


def apply_transparency(rgba: np.ndarray) -> np.ndarray:
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    lum = r + g + b
    max_rgb = np.maximum(np.maximum(r, g), b)
    bg_like = (lum < 155) & (b >= r - 12) & (b >= g - 12) & (max_rgb < 105)
    alpha = np.where(bg_like, 0, np.maximum(a, 255))
    alpha = np.where(alpha < 24, 0, alpha)
    alpha = np.where(alpha > 235, 255, alpha)
    rgba[..., 3] = alpha
    return rgba


def prepare_ai_layer(target_w: int, target_h: int) -> np.ndarray:
    ai = Image.open(AI_PATH).convert("RGBA")
    scale = target_h / ai.height
    resized_w = int(round(ai.width * scale))
    ai = ai.resize((resized_w, target_h), Image.Resampling.LANCZOS)
    left = max(0, (resized_w - target_w) // 2 + CROP_SHIFT_X)
    left = min(left, max(0, resized_w - target_w))
    ai = ai.crop((left, 0, left + target_w, target_h))
    return np.array(ai)


def main() -> None:
    if not BACKUP_PATH.exists():
        raise SystemExit(f"Missing backup: {BACKUP_PATH}")
    if not AI_PATH.exists():
        raise SystemExit(f"Missing AI image: {AI_PATH}")

    original = Image.open(BACKUP_PATH).convert("RGBA")
    src_w, src_h = original.size
    out_w = src_w + PAD_LEFT + PAD_RIGHT
    out_h = src_h + PAD_TOP + PAD_BOTTOM

    ai = prepare_ai_layer(out_w, out_h)
    orig_arr = np.array(original)
    canvas = np.zeros((out_h, out_w, 4), dtype=np.uint8)

    canvas[:, :, :3] = ai[:, :, :3]
    canvas[:, :, 3] = ai[:, :, 3]

    ox, oy = PAD_LEFT, PAD_TOP
    orig_alpha = orig_arr[..., 3]
    opaque = orig_alpha > 16
    canvas[oy : oy + src_h, ox : ox + src_w][opaque] = orig_arr[opaque]

    rgba = apply_transparency(canvas.astype(np.float32))
    result = Image.fromarray(rgba.astype(np.uint8), mode="RGBA")
    result.save(LOGO_PATH, format="PNG", optimize=True)

    preview_bg = Image.new("RGBA", result.size, (12, 14, 20, 255))
    preview = Image.alpha_composite(preview_bg, result)
    preview_path = ROOT / "public" / "logo-extended-preview.png"
    preview.save(preview_path, format="PNG", optimize=True)

    print(f"Saved extended logo: {LOGO_PATH} ({out_w}x{out_h})")
    print(f"Preview: {preview_path}")


if __name__ == "__main__":
    main()
