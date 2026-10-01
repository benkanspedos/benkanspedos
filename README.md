# benkanspedos.com

The source for [benkanspedos.com](https://benkanspedos.com), the one-page site for
Ben Kanspedos / Essential Concepts LLC (applied AI consulting, Tucson AZ).

## This branch: scroll variation B, "The Long Drive"

An exploration, not the live site. Scroll drives a truck down one continuous road, from a
vacant lot at dawn to a lit office at night, and the copy rides in the sky above it.
It stays on its pull request until Ben decides whether to keep it.

## What this is

A static page. No framework, no build step, no image assets, no dependencies beyond Google Fonts.

| File | Purpose |
|---|---|
| `index.html` | All markup and CSS. Readable on its own as a plain stacked page. |
| `journey.js` | The world. Draws every frame on one canvas and maps scroll to travel, time of day and the copy panels. |
| `DESIGN.md` | The design contract for the site on `main`: palette, type, signature element, voice rules. |
| `netlify.toml` | Deploy config. Publish directory is the repo root. |

How the page degrades:

- No JavaScript: the sections stack as an ordinary document with a sky-colored background each.
- Reduced motion, or a viewport under 470px tall: the same stacked document, and each section gets one still frame of the world.
- Otherwise: the pinned journey.

Test switches: `?static` forces the stacked page, `?motion` forces the journey, `?prof` records per-layer draw cost in `window.__prof`.

## Deployment

Pushes to `main` deploy to production at benkanspedos.com via Netlify (project: `benkanspedos`).
Pull requests get a deploy preview URL.

There is no local build. To work on the site, serve the folder (`python -m http.server`) and open it in a browser.

## Design contract

`DESIGN.md` describes the site on `main`. Ben waived its visual rules (palette, typefaces, motion policy)
for this exploration on 2026-09-30, so this branch does not follow them.
The voice rules in that file still apply to every word of copy here. If this variation is kept,
`DESIGN.md` needs a hand-written update to match it, and `og-image.png` still shows the old design.
