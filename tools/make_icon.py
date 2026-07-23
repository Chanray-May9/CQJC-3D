"""Generate the Android app icon source images for @capacitor/assets.

Produces an adaptive icon (separate foreground + background) plus a splash
screen. The foreground keeps its content inside the central safe zone, because
Android masks adaptive icons to a circle/squircle and crops roughly the outer
18% -- artwork drawn to the edge would be clipped.

Theme: a white campus skyline on a blue vertical gradient, echoing the sky and
blue glazing of the scene itself.
"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand"
OUT.mkdir(exist_ok=True)

SIZE = 1024
TOP = (0x22, 0x4E, 0x78)     # deep morning blue
BOTTOM = (0x4C, 0x86, 0xC0)  # lighter sky blue


def gradient(size, top, bottom):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        px_row = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = px_row
    return img


def skyline(size):
    """White skyline on transparent, within the central safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)

    base = round(size * 0.70)   # shared ground line for every tower
    ground_l, ground_r = round(size * 0.24), round(size * 0.76)

    # (left, top) as fractions; every tower drops to the shared base.
    towers = [
        (0.26, 0.42, 0.10),
        (0.37, 0.30, 0.11),
        (0.49, 0.38, 0.12),
        (0.62, 0.34, 0.11),
    ]

    for fx, ftop, fw in towers:
        left = round(size * fx)
        top = round(size * ftop)
        w = round(size * fw)
        right = left + w
        d.rectangle([left, top, right, base], fill=white)

        # Punch out window bands so the towers read as buildings, not slabs.
        hole = tuple(  # gap colour is irrelevant -- it is cut to transparent
            0 for _ in range(4)
        )
        rows = max(2, round((base - top) / (size * 0.055)))
        gap_w = round(w * 0.16)
        for r in range(rows):
            wy = top + round((r + 0.8) * (base - top) / (rows + 0.6))
            for cx in (left + gap_w, right - gap_w - round(w * 0.22)):
                d.rectangle(
                    [cx, wy, cx + round(w * 0.22), wy + round(size * 0.018)],
                    fill=hole,
                )

    # Ground line tying the towers together.
    d.rectangle([ground_l, base, ground_r, base + round(size * 0.020)], fill=white)
    return img


def main():
    # Adaptive icon: foreground art + solid-ish gradient background.
    bg = gradient(SIZE, TOP, BOTTOM)
    bg.save(OUT / "icon-background.png")

    fg = skyline(SIZE)
    fg.save(OUT / "icon-foreground.png")

    # Legacy / round fallback: composite the two so non-adaptive launchers still
    # get the full design rather than a bare skyline.
    flat = gradient(SIZE, TOP, BOTTOM).convert("RGBA")
    flat.alpha_composite(fg)
    flat.convert("RGB").save(OUT / "icon-only.png")

    # Splash screen, centred logo on the same gradient at 2732 for all densities.
    sp = 2732
    splash = gradient(sp, TOP, BOTTOM).convert("RGBA")
    logo = skyline(SIZE).resize((round(sp * 0.42), round(sp * 0.42)))
    splash.alpha_composite(logo, ((sp - logo.width) // 2, (sp - logo.height) // 2))
    splash.convert("RGB").save(OUT / "splash.png")
    splash.convert("RGB").save(OUT / "splash-dark.png")

    for f in sorted(OUT.glob("*.png")):
        print(f"  {f.name}  {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
