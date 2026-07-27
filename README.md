# benkanspedos.com

The source for [benkanspedos.com](https://benkanspedos.com), the one-page site for
Ben Kanspedos / Essential Concepts LLC (applied AI consulting, Tucson AZ).

## What this is

A single static page. No framework, no build step, no dependencies beyond Google Fonts.

| File | Purpose |
|---|---|
| `index.html` | The entire site. Inline CSS and one small IntersectionObserver script. |
| `DESIGN.md` | The binding design contract: palette, type, signature element, voice rules. |
| `netlify.toml` | Deploy config. Publish directory is the repo root. |

## Deployment

Pushes to `main` deploy to production at benkanspedos.com via Netlify (project: `benkanspedos`).
Pull requests get a deploy preview URL.

There is no local build. To work on the site, open `index.html` in a browser.

## Design contract

`DESIGN.md` is authoritative, not advisory. Read it before changing anything visual.
The palette, the three typefaces, and the FIND / BUILD / STICK rail are locked.
The voice rules in that file are non-negotiable and apply to every word of copy.
