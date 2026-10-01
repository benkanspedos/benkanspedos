# benkanspedos.com

The source for [benkanspedos.com](https://benkanspedos.com), the one-page site for
Ben Kanspedos / Essential Concepts LLC (applied AI consulting, Tucson AZ).

## This branch: scroll variation C, "One Lit Window"

An exploration, not the live site. Scroll zooms through four nested worlds, each found
inside the last: the portfolio skyline, one office through one window, one screen, and
the workflow built inside one form field. Then it pulls back out while the windows light up.

| File | Purpose |
|---|---|
| `index.html` | Markup, all copy, all CSS. Every word of the page is real DOM text. |
| `scene.js` | The canvas scene and the scroll camera. No libraries, no image assets. |
| `netlify.toml` | Deploy config. Publish directory is the repo root. |
| `DESIGN.md` | The design contract for the live site. See the note below. |

Three modes, picked before first paint:

- **live**: the scroll-driven scene. The default.
- **still**: the same page as a plain illustrated article, one still frame per section.
  Used when the visitor has reduced motion set.
- **no script**: the article without the pictures.

Add `?still` or `?live` to the URL to force either mode without changing a system setting.

Story timing lives in `stateAt()` and the camera stops in `buildViews()`, both in `scene.js`.
How long each beat holds is the `--dwell` value on its element in `index.html`.

### If this variation is kept

- `DESIGN.md` still describes the old page (palette, type, motion policy). Its visual rules
  were waived for this exploration on 2026-09-30. It needs a hand-written update in the
  same change that merges this. Its voice rules were not waived and this page follows them.
- `og-image.png` and `og-card.html` still show the old design.

## Deployment

Pushes to `main` deploy to production at benkanspedos.com via Netlify (project: `benkanspedos`).
Pull requests get a deploy preview URL.

There is no build step. To work on the site, serve the folder (`python -m http.server 8103`)
and open it in a browser.
