"""Remove background from logo.png and save transparent PNG."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
BACKUP_PATH = ROOT / "public" / "logo-opaque-backup.png"


def build_alpha(original: Image.Image, rembg_result: Image.Image) -> np.ndarray:
    orig = np.array(original.convert("RGBA"), dtype=np.float32)
    rembg_rgba = np.array(rembg_result.convert("RGBA"))
    alpha = rembg_rgba[..., 3].astype(np.float32)

    r, g, b = orig[..., 0], orig[..., 1], orig[..., 2]
    lum = r + g + b
    max_rgb = np.maximum(np.maximum(r, g), b)
    min_rgb = np.minimum(np.minimum(r, g), b)
    saturation = max_rgb - min_rgb

    # Dark bluish background from the original logo file.
    bg_like = (lum < 145) & (b >= r - 8) & (b >= g - 8) & (max_rgb < 95)
    # Soft outer glow that rembg keeps as semi-transparent fringe.
    glow = (alpha < 210) & (lum < 180) & (saturation < 120) & (b >= r - 15)

    alpha = np.where(bg_like | glow, 0, alpha)
    alpha = np.where(alpha < 32, 0, alpha)
    alpha = np.where(alpha > 230, 255, alpha)
    return alpha.astype(np.uint8)


def main() -> None:
    if not LOGO_PATH.exists():
        raise SystemExit(f"Missing logo: {LOGO_PATH}")

    if not BACKUP_PATH.exists():
        BACKUP_PATH.write_bytes(LOGO_PATH.read_bytes())
        print(f"Backup saved: {BACKUP_PATH}")

    original = Image.open(LOGO_PATH)
    session = new_session("u2net")
    removed = remove(
        LOGO_PATH.read_bytes(),
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
        post_process_mask=True,
    )
    rembg_result = Image.open(io.BytesIO(removed))

    rgba = np.array(original.convert("RGBA"))
    rgba[..., 3] = build_alpha(original, rembg_result)

    result = Image.fromarray(rgba, mode="RGBA")
    result.save(LOGO_PATH, format="PNG", optimize=True)

    alpha = rgba[..., 3]
    print(f"Updated: {LOGO_PATH}")
    print(f"Transparent: {(alpha == 0).mean() * 100:.1f}%")
    print(f"Opaque: {(alpha == 255).mean() * 100:.1f}%")


if __name__ == "__main__":
    main()
