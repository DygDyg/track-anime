"""Prepare canvas + mask for logo edge outpainting."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
OUT_DIR = ROOT / "tmp" / "imagegen"

PAD_LEFT = 72
PAD_RIGHT = 96
PAD_TOP = 16
PAD_BOTTOM = 88
SCALE = 2
BG = (12, 14, 20, 255)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    logo = Image.open(LOGO_PATH).convert("RGBA")
    src_w, src_h = logo.size
    out_w = src_w + PAD_LEFT + PAD_RIGHT
    out_h = src_h + PAD_TOP + PAD_BOTTOM

    canvas = Image.new("RGBA", (out_w, out_h), BG)
    canvas.paste(logo, (PAD_LEFT, PAD_TOP), logo)

    mask = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 255))
    keep = Image.new("L", (src_w, src_h), 255)
    keep = keep.filter(ImageFilter.MinFilter(5))
    keep = keep.filter(ImageFilter.GaussianBlur(radius=2))
    mask.paste(keep, (PAD_LEFT, PAD_TOP))

    if SCALE != 1:
        canvas = canvas.resize((out_w * SCALE, out_h * SCALE), Image.Resampling.LANCZOS)
        mask = mask.resize((out_w * SCALE, out_h * SCALE), Image.Resampling.LANCZOS)

    canvas_path = OUT_DIR / "logo-outpaint-input.png"
    mask_path = OUT_DIR / "logo-outpaint-mask.png"
    meta_path = OUT_DIR / "logo-outpaint-meta.txt"

    canvas.convert("RGB").save(canvas_path, format="PNG")
    mask.save(mask_path, format="PNG")

    meta_path.write_text(
        "\n".join(
            [
                f"source={LOGO_PATH}",
                f"pad_left={PAD_LEFT}",
                f"pad_right={PAD_RIGHT}",
                f"pad_top={PAD_TOP}",
                f"pad_bottom={PAD_BOTTOM}",
                f"scale={SCALE}",
                f"output_size={canvas.size[0]}x{canvas.size[1]}",
                f"source_size={src_w}x{src_h}",
            ]
        ),
        encoding="utf-8",
    )

    print(f"Input: {canvas_path} ({canvas.size[0]}x{canvas.size[1]})")
    print(f"Mask:  {mask_path}")
    print(f"Meta:  {meta_path}")


if __name__ == "__main__":
    main()
