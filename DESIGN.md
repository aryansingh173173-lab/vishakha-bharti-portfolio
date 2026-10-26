# Beyond the Conventional
### An interactive architectural journey by Vishakha Bharti

Portfolio of **Vishakha Bharti**, B.Arch, IIT Kharagpur (2023–2026).
Source: `_4th Year Portfolio_VISHAKHA .pdf` (40 A3 pages, 115 MB, made in Canva).

> **Guiding rule:** this is an architectural exhibition that happens to be explorable through a 3D beach, not a 3D beach game that happens to contain architecture.
> The frames are exhibition architecture. The images inside them are Vishakha's actual work. That distinction stays visually obvious.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| World | **Realistic** sunset cove from free CC0 assets (Poly Haven, see assets/CREDITS.md): real sky panorama + HDR lighting, scanned sand/grass/building textures, scanned rocks, cliffs, tropical shrubs, trees and lanterns. Her images are shown in **true colour** (pre-corrected for tone mapping and grade) |
| Navigation | **Scroll / swipe** moves the buggy along a fixed path (no steering, no edges to bump into). Arrow keys jump stop to stop. Stopping near a project settles on it |
| Projects | A **3D pavilion per stop in the project's own architectural language**, sharing one layout (hero wall + two image side walls): 01 coastal vernacular (laterite, lime plaster, timber posts, clay-tile hip roof, brass diyas) · 02 Bengal terracotta (exposed brick, folded skyline, brick jaali, white lattice canopy) · 03 brutalist (board-formed concrete, waffle slab, curved shell, louvres) · 04 modern residential (white stucco, thin flat roof on steel posts, timber slats). Pavilions **drop onto the sand** as you approach; a blinking red dot on each main image means "click to open" |
| Panels | On arrival a light sweep crosses the glowing images, then an **overview card** fades in; "View project" opens the full sheet; images open **full screen** |
| Entry | Two equal buttons: **Explore in 3D** and **View projects**, plus **Download portfolio (PDF)** |
| First screen | **Preloader**: giant percentage counter, her renders flicking past in a window that follows the cursor, the name rising out of masks (inverting over the image), film grain, glowing cursor; a rotating "Begin the journey" ring with a red dot; the window opens to full screen on entry |
| Journey rail | A slim scroll track on the right edge: stops as ticks at their real distance, a **red glowing dot** for the buggy, a moving red "scroll" cue until the first scroll |
| Pier | A **centred finale card**: portrait, name, short about, contact, PDF, all projects |
| Ending | Wooden pier: About, education, contact, and "Until the next idea!" |
| Sound | Waves + soft music + gentle engine. Starts only after a click. Mute always visible |
| Phones | Touch joystick + Projects list; panel becomes a bottom sheet; automatic lower quality |
| Public contact | Gmail, LinkedIn, Instagram. **No phone number** anywhere, including the PDF |

---

## 2. Architecture: content first, 3D second

```
            js/data.js  (single source: projects, galleries, about, contact)
                 │
     ┌───────────┴────────────┐
     ▼                        ▼
 Portfolio mode            3D mode
 (plain HTML/CSS,          (Three.js beach = navigation only;
  no Three.js loaded)       project info opens in the same HTML panels)
```

- Three.js is loaded **only** when 3D mode starts. If WebGL is missing or crashes, the site falls back to portfolio mode.
- Portfolio mode is complete on its own: every project, every image, the drawing viewer, About, Contact, and the PDF.

---

## 3. The beach route

```
 [START] ─▶ 01 Thendral Marabu ─▶ 02 Banglar Shilpo Ghar ─▶ 03 Sanskriti Milon Kendra ─▶ 04 Selected Works ─▶ [PIER]
```

- **Length:** not fixed. Target roughly 25–35 s of uninterrupted driving, tuned by actually driving it.
- **Variety:** something changes every 8–10 s (shoreline curve, rock outcrop, palm density, pier on the horizon). No obstacles, no collectibles.
- **Bounds:** the buggy stays between the dunes and the shallow water.
- Wooden signposts point to the next stop.

### The unified frame
Same height, proportions, beam thickness, image placement and glowing ring at every stop. Only the material detail changes:

| Stop | Detail taken from her actual design |
|---|---|
| 01 Thendral Marabu | Timber pergola beams + jaali screen (from the resort renders) |
| 02 Banglar Shilpo Ghar | Terracotta brick plinth + diagonal lattice casting shadows on the sand (page 20) |
| 03 Sanskriti Milon Kendra | Frame carved from a solid mass (her "carved monolith" concept) |
| 04 Selected Works | Two smaller frames under one stop: **Working Drawings** and **Interiors**. No props |

### Composition at each stop
- Frames are turned about **45° to the shoreline**, so the shot holds the render on one side and the sunset horizon on the other.
- Render images are **unlit (self-lit)**, so they stay readable against the backlight.
- Each stop has a **hand-placed camera view**.

### Camera moves
- Arriving at a stop: buggy eases to a halt, camera glides to the stop's view, frame glows, panel slides in. **Under 1.2 s.**
- Driving input interrupts the move smoothly; an explicit **Skip** button exists. No "any key skips".
- Full move only the first time per stop; afterwards it's quicker.
- `prefers-reduced-motion`: cuts instead of glides.

---

## 4. Projects and images

| # | Project | Hero (on the frame) | Gallery |
|---|---|---|---|
| 01 | **Thendral Marabu**: beach resort, Chennai | Aerial of cottages on the shore (p6) | courtyard (p12), views (p11), concept (p8), site plan (p9), sections (p10) |
| 02 | **Banglar Shilpo Ghar**: craft museum, Kolkata | Terracotta exterior (p15) | evening elevations (p19), lattice (p20), concept + site (p18), floor plans (p16–17) |
| 03 | **Sanskriti Milon Kendra**: community centre, Kalyani | **Exterior (p22)** | lobby (p32–33), double-height gallery (p31), auditorium (p30), axonometric (p24), concept (p25), plans (p26–27), sections (p28–29) |
| 04 | **Selected Works** | Working drawing (p35) + living area (p39) | **Working Drawings:** plan (p35), sections (p36), kitchen details (p37) · **Interiors:** living area (p39), mood board (p38) |

### Image pipeline (`tools/extract.py`)
No single export resolution. Per page:

| Page type | Method |
|---|---|
| Full-page renders | Extract the **original embedded image** (≈1500 px; a bigger export can't add detail) |
| Drawings with labels | **Render the whole page** at high resolution so vector labels stay sharp |
| Two-page spreads | Stitch both pages into one image |

Two tiers: a light preview for panels and galleries, plus an HD version loaded only in the viewer. Original CAD or vector PDFs beat all of this if Vishakha has them.

### Drawing viewer
Full screen, mouse-wheel / pinch zoom, drag to pan, arrows between images, Esc to close.

### Downloadable PDF
- Phone number **truly removed** (redaction, not a box on top). Verified by searching the file's text afterwards.
- Re-compressed: aim for 10–15 MB, accept ~20 MB if drawings need it. Most renders are only ~1500 px, so the size drop costs no visible quality.

---

## 5. Look

| Token | Colour | Use |
|---|---|---|
| Sand | `#C8AE8F` | Panel tint, accents |
| Terracotta | `#B5653A` | Buttons, active state |
| Sea teal | `#9FC3BE` | Secondary accent |
| Sunset glow | `#F2A65A` | Highlights, ring glow |
| Ink | `#1E1B18` | Text |
| Glass | white ~16% + blur | Panels |

Type: **Cormorant Garamond** (headings, like the cover), **Montserrat** uppercase (project titles), **Inter** (body).

---

## 6. Build phases

1. **Experience:** data file, full portfolio mode, rough full shoreline, simple buggy, four frames, pier, basic navigation
2. **Visual quality:** intro, sunset, sea, buggy movement, resort stop and gallery polished
3. **Exhibition:** remaining stops with their real details
4. **Professional:** drawing viewer, cleaned PDF, mobile, accessibility, audio, performance tiers
5. **Cinematic polish:** tyre tracks, sand spray, richer vegetation, sound design, palm sway

---

## 7. Open items
- Original CAD / vector drawings from Vishakha (would replace the PDF-derived drawings)
- Vishakha's OK to publish
- Domain: custom, or a free `.vercel.app` address first
- Deploy only the site files; **never upload the original 115 MB PDF** (it contains the phone number)
