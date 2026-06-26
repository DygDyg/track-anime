from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
BG = (12, 14, 20)  # #0c0e14 — фон сайта (тёмная тема)

TARGETS = [
    ("kodik-player-bg-1920x1080.png", 1920, 1080, 0.52),
    ("kodik-player-bg-1280x720.png", 1280, 720, 0.52),
]

logo = Image.open(LOGO_PATH).convert("RGBA")

for filename, width, height, scale in TARGETS:
    canvas = Image.new("RGBA", (width, height), (*BG, 255))
    max_side = int(min(width, height) * scale)
    logo_resized = logo.resize((max_side, max_side), Image.Resampling.LANCZOS)
    x = (width - max_side) // 2
    y = (height - max_side) // 2
    canvas.paste(logo_resized, (x, y), logo_resized)
    out_path = ROOT / "public" / filename
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)
    print(f"Saved {out_path} ({width}x{height}), logo {max_side}px")
