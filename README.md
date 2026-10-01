# benkanspedos.com

The source for [benkanspedos.com](https://benkanspedos.com), the one-page site for
Ben Kanspedos / Essential Concepts LLC (applied AI consulting, Tucson AZ).

## What this is

A static site with no build step: what is committed is what Netlify serves.

**This branch is scroll variation A ("Same Blocks, Nine Worlds"), an exploration that is not
on the live domain.** One fixed WebGL stage of 720 blocks rebuilds into a new world for each
section as the page scrolls. The copy is the live page's copy.

| File | Purpose |
|---|---|
| `index.html` | Markup and all copy. |
| `site.css` | Both layouts: the pinned stage, and the plain stacked page that reduced motion, no WebGL2 and no JS fall back to. |
| `stage.js` | The stage: nine worlds, the scroll choreography, and the stills rendered for reduced motion. |
| `vendor/` | three.js r180, pinned and served from the repo so nothing depends on a CDN. |
| `DESIGN.md` | The design contract for the live site: palette, type, signature element, voice rules. |
| `netlify.toml` | Deploy config. Publish directory is the repo root. |

## Deployment

Pushes to `main` deploy to production at benkanspedos.com via Netlify (project: `benkanspedos`).
Pull requests get a deploy preview URL.

There is no local build. `stage.js` is a module script, so it will not load from `file://`:
serve the folder over HTTP (any static server that sends `.js` as JavaScript) and open that.

## Design contract

`DESIGN.md` is authoritative for the live site. Read it before changing anything visual there.
This variation sets its palette lock and its no-parallax motion policy aside, by Ben's ruling of
2026-09-30, and keeps the typefaces. The voice rules in that file are non-negotiable and apply
to every word of copy on any branch.
