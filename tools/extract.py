"""Build web images and a cleaned download PDF from the source portfolio.

Usage:  python -I tools/extract.py "_4th Year Portfolio_VISHAKHA .pdf"

Per item, one of three methods (see DESIGN.md section 4):
  img    - extract the original embedded image (renders; a bigger export adds no detail)
  page   - render the whole page so vector labels stay sharp (drawings)
  spread - render several pages and stitch them side by side
Writes assets/img/<id>.jpg (preview), assets/img/hd/<id>.jpg (viewer)
and assets/img/thumb/<id>.jpg (loading-screen mosaic).
"""
import io
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img"
PREVIEW_W = 1400
THUMB_W = 520         # loading-screen mosaic
PAGE_HD_W = 3600      # drawing pages
PAGE_XHD_W = 4600     # pages whose embedded drawing is ~5000 px wide

ITEMS = [
    # 01 Thendral Marabu
    ("resort-aerial", "img", [6]),
    ("resort-courtyard", "img", [12]),
    ("resort-views", "page", [11]),
    ("resort-concept", "page", [8]),
    ("resort-siteplan", "page", [9]),
    ("resort-sections", "page", [10]),
    # 02 Banglar Shilpo Ghar
    ("museum-exterior", "img", [15]),
    ("museum-elevations", "page", [19]),
    ("museum-lattice", "img", [20]),
    ("museum-concept", "page", [18]),
    ("museum-plans", "spread", [16, 17]),
    # 03 Sanskriti Milon Kendra
    ("community-exterior", "img", [22]),
    ("community-lobby", "img", [32]),
    ("community-gallery", "img", [31]),
    ("community-auditorium", "img", [30]),
    ("community-axo", "page", [24]),
    ("community-concept", "page", [25]),
    ("community-plans-lower", "page", [26]),
    ("community-plans-upper", "page", [27]),
    ("community-section-aa", "page", [28]),
    ("community-sections", "page", [29]),
    # 04 Selected Works
    ("works-plan", "page", [35], PAGE_XHD_W),
    ("works-sections", "page", [36]),
    ("works-kitchen", "page", [37], PAGE_XHD_W),
    ("interior-living", "img", [39]),
    ("interior-moodboard", "page", [38]),
    # About
    ("about-portrait", "img", [2]),
]


def largest_image(doc, page):
    imgs = page.get_images(full=True)
    xref = max(imgs, key=lambda i: i[2] * i[3])[0]
    pix = pymupdf.Pixmap(doc, xref)
    if pix.alpha:
        pix = pymupdf.Pixmap(pix, 0)
    if pix.n > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def render(page, width):
    z = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def stitch(images):
    h = min(i.height for i in images)
    images = [i.resize((round(i.width * h / i.height), h), Image.LANCZOS) for i in images]
    out = Image.new("RGB", (sum(i.width for i in images), h), "white")
    x = 0
    for i in images:
        out.paste(i, (x, 0))
        x += i.width
    return out


def save(img, name):
    img.save(OUT / "hd" / f"{name}.jpg", quality=86, optimize=True, progressive=True)
    for w, folder, q in ((PREVIEW_W, OUT, 80), (THUMB_W, OUT / "thumb", 74)):
        small = img.copy()
        if small.width > w:
            small = small.resize((w, round(small.height * w / small.width)), Image.LANCZOS)
        small.save(folder / f"{name}.jpg", quality=q, optimize=True, progressive=True)
    return img.size


def build_images(doc):
    (OUT / "hd").mkdir(parents=True, exist_ok=True)
    (OUT / "thumb").mkdir(parents=True, exist_ok=True)
    for item in ITEMS:
        name, kind, pages = item[:3]
        width = item[3] if len(item) > 3 else PAGE_HD_W
        if kind == "img":
            img = largest_image(doc, doc[pages[0] - 1])
        elif kind == "page":
            img = render(doc[pages[0] - 1], width)
        else:
            img = stitch([render(doc[p - 1], width // len(pages) * 2) for p in pages])
        print(f"{name:24s} {kind:6s} {img.size}")
        save(img, name)


PHONE = re.compile(r"\+?\s*91[\s-]*\d{5}\s*\d{5}")


def build_pdf(src):
    """Copy of the portfolio with the phone number redacted and images re-compressed."""
    doc = pymupdf.open(src)
    for page in doc:
        text = page.get_text()
        for m in PHONE.finditer(text):
            for rect in page.search_for(m.group(0).strip()):
                page.add_redact_annot(rect + (-1, -1, 1, 1))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                              graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    doc.rewrite_images(quality=84)
    doc.set_metadata({"title": "Architectural Portfolio — Vishakha Bharti", "author": "Vishakha Bharti"})
    dst = ROOT / "assets" / "Vishakha-Bharti-Portfolio.pdf"
    doc.save(dst, garbage=4, deflate=True, clean=True)
    doc.close()

    check = pymupdf.open(dst)
    leaks = [i + 1 for i, p in enumerate(check) if PHONE.search(p.get_text())]
    check.close()
    size = dst.stat().st_size / 1e6
    print(f"PDF {dst.name}: {size:.1f} MB, phone found on pages: {leaks or 'none'}")
    if leaks:
        sys.exit("phone number still present")


if __name__ == "__main__":
    src = sys.argv[1]
    build_images(pymupdf.open(src))
    build_pdf(src)
