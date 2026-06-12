"""Strip the off-white background from generated logo PNGs to make them transparent."""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "brand"

TARGETS = ["logo_horizontal.png", "logo_tight.png", "logo_v2_crest.png"]


def remove_bg(src_path: Path, dst_path: Path) -> None:
    im = Image.open(src_path).convert("RGBA")
    px = im.load()
    w, h = im.size
    # Sample corner pixels to estimate background color
    samples = [
        px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1],
        px[w // 2, 0], px[w // 2, h - 1], px[0, h // 2], px[w - 1, h // 2],
    ]
    rs = sum(s[0] for s in samples) / len(samples)
    gs = sum(s[1] for s in samples) / len(samples)
    bs = sum(s[2] for s in samples) / len(samples)
    print(f"{src_path.name} bg ~ ({rs:.0f}, {gs:.0f}, {bs:.0f})")

    # Threshold: pixels within ~28 of bg become fully transparent.
    # Pixels slightly farther get a soft alpha ramp for clean anti-aliased edges.
    hard = 28
    soft = 58
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = abs(r - rs) + abs(g - gs) + abs(b - bs)
            if d < hard:
                px[x, y] = (r, g, b, 0)
            elif d < soft:
                ratio = (d - hard) / (soft - hard)
                px[x, y] = (r, g, b, int(a * ratio))
            # else: keep as-is
    im.save(dst_path, optimize=True)
    print(f"saved {dst_path.name}")


def main() -> None:
    for name in TARGETS:
        p = OUT / name
        if not p.exists():
            print(f"skip {name} (missing)")
            continue
        remove_bg(p, p)
    # logo.png is the canonical brand asset - copy from logo_v2_crest now bg-stripped.
    src = OUT / "logo_v2_crest.png"
    if src.exists():
        (OUT / "logo.png").write_bytes(src.read_bytes())


if __name__ == "__main__":
    main()
