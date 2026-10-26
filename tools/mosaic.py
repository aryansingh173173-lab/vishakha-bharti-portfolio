"""Build the loading-screen mosaic: hundreds of small tiles cut from the portfolio, in one atlas.

Usage:  python -I tools/mosaic.py

Reads the cleaned PDF (assets/Vishakha-Bharti-Portfolio.pdf, phone already redacted), so nothing
reaches the mosaic that isn't already in the public download. Each picture is taken as it appears
on the page (masks and clipping applied); big ones also give a few close-up details.
Writes assets/img/mosaic.webp and assets/img/mosaic.json.
"""
import hashlib
import json
import random
from pathlib import Path

import pymupdf
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "assets" / "Vishakha-Bharti-Portfolio.pdf"
OUT = ROOT / "assets" / "img"
TILE_W, TILE_H = 120, 90
COLS = 16
MAX_TILES = 288
ZOOM = 2.0               # page render scale (144 dpi)
SKIP_PAGES = {40}        # contact page: text only

random.seed(7)


def cover(im, w, h):
    """Centre-crop to w:h and resize (object-fit: cover)."""
    iw, ih = im.size
    if iw / ih > w / h:
        nw = int(ih * w / h)
        im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = int(iw * h / w)
        im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def interesting(tile):
    """Skip flat colour and mostly-blank paper (a wall of white sheets reads as grey)."""
    st = ImageStat.Stat(tile.convert("L"))
    return st.stddev[0] > 18 and st.mean[0] < 200


def main():
    doc = pymupdf.open(PDF)
    tiles, seen = [], set()

    hidden = []          # title-block text (student roll number) stays out of the mosaic

    def add(im, box=None):
        if box and any(pymupdf.Rect(box) / ZOOM & h for h in hidden):
            return
        t = cover(im, TILE_W, TILE_H)
        key = hashlib.md5(t.convert("L").resize((12, 9)).tobytes()).hexdigest()
        if key in seen or not interesting(t):
            return
        seen.add(key)
        tiles.append(t)

    for pno, page in enumerate(doc, 1):
        if pno in SKIP_PAGES:
            continue
        pix = page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), alpha=False)
        shot = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        hidden[:] = [r + (-30, -30, 30, 30) for r in page.search_for("23AR")]
        xrefs = {im[0] for im in page.get_images(full=True)}
        for xref in xrefs:
            for r in page.get_image_rects(xref):
                r = r & page.rect
                if r.width < 90 or r.height < 60:
                    continue
                box = [int(v * ZOOM) for v in (r.x0, r.y0, r.x1, r.y1)]
                im = shot.crop(box)
                add(im, box)
                # close-ups from the bigger pictures
                w, h = im.size
                if w > 500 and h > 360:
                    for _ in range(3 if w * h > 600_000 else 2):
                        cw = int(w * random.uniform(0.32, 0.5))
                        ch = int(cw * TILE_H / TILE_W)
                        if ch >= h:
                            continue
                        x = random.randint(0, w - cw)
                        y = random.randint(0, h - ch)
                        add(im.crop((x, y, x + cw, y + ch)), (box[0] + x, box[1] + y, box[0] + x + cw, box[1] + y + ch))
        # drawing pages: a few details of the linework too
        if pno in {9, 10, 16, 17, 19, 24, 26, 27, 28, 29, 35, 36, 37}:
            W, H = shot.size
            for _ in range(5):
                cw = int(W * random.uniform(0.16, 0.26))
                ch = int(cw * TILE_H / TILE_W)
                x = random.randint(0, W - cw)
                y = random.randint(0, H - ch)
                add(shot.crop((x, y, x + cw, y + ch)), (x, y, x + cw, y + ch))

    random.shuffle(tiles)
    tiles = tiles[:MAX_TILES]
    rows = (len(tiles) + COLS - 1) // COLS
    atlas = Image.new("RGB", (COLS * TILE_W, rows * TILE_H), (20, 14, 13))
    for i, t in enumerate(tiles):
        atlas.paste(t, ((i % COLS) * TILE_W, (i // COLS) * TILE_H))
    atlas.save(OUT / "mosaic.webp", "WEBP", quality=74, method=6)
    meta = {"count": len(tiles), "cols": COLS, "tileW": TILE_W, "tileH": TILE_H}
    (OUT / "mosaic.json").write_text(json.dumps(meta))
    print(meta, (OUT / "mosaic.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
