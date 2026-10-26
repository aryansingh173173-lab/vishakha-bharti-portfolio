# Beyond the Conventional — Vishakha Bharti

An architectural portfolio you can explore two ways:

- **Explore in 3D:** scroll (or swipe) to roll a beach buggy along a sunset cove. Each project drops onto the sand as a small pavilion showing its images, and an overview card appears as you arrive.
- **View projects:** a normal, fast portfolio page. It works without 3D, on any device.

The full design plan is in [DESIGN.md](DESIGN.md).

## Run it on your computer

Needs [Node.js](https://nodejs.org) (any recent version).

```bash
node tools/serve.mjs
```

Then open http://localhost:8123. (Opening `index.html` by double-clicking won't work; browsers block the 3D files when they're not served.)

## Publish it

The site is plain files with no build step. Publish **only** these:

```
index.html   css/   js/   assets/
```

**Do not upload** `_4th Year Portfolio_VISHAKHA .pdf`. It is the 115 MB original and it contains the phone number. The site uses the cleaned copy in `assets/Vishakha-Bharti-Portfolio.pdf` (18.5 MB, phone number removed).

- **Vercel:** `.vercelignore` already leaves out the original PDF and the tools, so `npx vercel` from this folder is safe.
- **Netlify drop / any host:** make a new folder containing only `index.html`, `css`, `js` and `assets`, and upload that.

## Change the content

All text lives in [js/data.js](js/data.js): project titles, descriptions, captions, About and contact. Both the 3D view and the portfolio page read from it.

To re-export images from a new version of the PDF:

```bash
python -I tools/extract.py "_4th Year Portfolio_VISHAKHA .pdf"
```

This rebuilds `assets/img/` (previews + `hd/` for the zoom viewer) and the cleaned download PDF, and stops with an error if a phone number is still found.

## Use your own 3D models

The palms, bushes, rocks and buggy can be swapped for models you download or make.

1. Get the model as a **.glb** file (see "Where to get models" below).
2. Put it in `assets/models/`.
3. List it in `assets/models/models.json`, for example:

```json
{
  "palm":  { "file": "palm.glb" },
  "bush":  { "file": "bush.glb" },
  "rock":  { "file": "rock.glb" },
  "buggy": { "file": "buggy.glb", "rotateY": 90 }
}
```

Reload the page. Each model is resized automatically (palms ~9 m, bushes ~1.4 m, rocks ~1.2 m, buggy ~2.6 m long), stood on the ground and repeated across the cove. If something looks wrong, add `"height"`, `"length"` or `"scale"` to change the size, or `"rotateY"` (degrees) to turn it; the buggy should face along the beach. A missing or broken file is skipped and the built-in version is used, so the site never breaks.

Keep each file small (ideally under 1–2 MB). A palm is repeated over 100 times, so a low-poly model matters more than a detailed one.

### Where to get models

| Source | Licence | Notes |
|---|---|---|
| [Quaternius](https://quaternius.com) | CC0 (free, no credit needed) | Low-poly nature packs, already in .glb |
| [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 | Trees, palms, rocks, plants |
| [Poly Haven](https://polyhaven.com/models) | CC0 | Realistic rocks, plants and props, plus textures |
| [Poly Pizza](https://poly.pizza) | Mixed (CC0 or CC-BY) | Check each model; CC-BY needs a credit line |
| [Sketchfab](https://sketchfab.com) | Varies per model | Filter "Downloadable"; download as glTF; check licence |
| [3D Warehouse](https://3dwarehouse.sketchup.com) | General Model License | SketchUp models; fine inside a larger work like this site, but don't redistribute the raw models |

### SketchUp models

SketchUp models work, but they need to become **.glb** first:

- **SketchUp Pro 2025 / 2026 (desktop):** File → Export → 3D Model → choose **GLB**.
- **SketchUp Free (web)** limits exports, and GLB may not be offered. If it isn't, export what you can (or download the .skp), open it in Blender (with a SketchUp importer add-on) and use File → Export → glTF 2.0 (.glb).
- Before exporting, delete hidden geometry and anything you don't need. SketchUp trees are often very heavy; Blender's Decimate modifier can cut them down.

**CAD blocks (.dwg) don't work:** they're 2D drawings, not 3D models.

### Her own buildings (from SketchUp)

Each project can show its real building just past its pavilion, as its own stop with an **Open SketchUp file** button that downloads the original `.skp`. The resort, museum and auditorium are already in. To add or update one (Windows, with SketchUp installed; no SketchUp window opens):

```
python -I tools/skp2gltf.py "MY BUILDING.skp" out/mybuilding
npx -y @gltf-transform/cli@4 optimize out/mybuilding.gltf assets/models/buildings/mybuilding.glb --compress draco --texture-compress webp --texture-size 512 --simplify-ratio 0.3 --simplify-error 0.005
```

Then add `model: 'mybuilding'` to the project in `js/data.js`, plus `skp: { href: 'assets/models/skp/mybuilding.skp', size: '12 MB' }` for the download (copy the `.skp` there; `href` can also be a Google Drive share link, which opens in a new tab). The converter keeps the largest building in the file (models often hold extra copies side by side), leaves out SketchUp trees, people and cars, and skips hidden things. For an exploded view, add `--below-gap` to keep just the assembled building. Buildings only load on computers; phones show the pavilions. The `.skp` files in `assets/models/skp/` are published with the site so anyone can download them; the originals at the top of the folder are not (`.vercelignore`).

## How it's built

| Part | Where |
|---|---|
| Content (single source) | `js/data.js` |
| Intro, panels, portfolio page, routing | `js/app.js`, `css/style.css` |
| Zoomable drawing viewer | `js/viewer.js` |
| Loading screen mosaic thumbnails | `assets/img/thumb/` |
| Sound (generated, no audio files) | `js/audio.js` |
| 3D beach (Three.js, loaded only when needed) | `js/world/` |
| Your own 3D models (optional) | `assets/models/`, loaded by `js/world/models.js` |
| Image + PDF pipeline | `tools/extract.py` |

Add `?debug` to the URL to expose the 3D scene as `window.__vb` in the browser console for tuning.
