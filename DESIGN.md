# DESIGN.md — benkanspedos.com one-pager

Binding contract for this site. Locked 2026-07-11 (first pass). Single-file static page at `consulting/site/index.html`.

## Palette (locked)

| Token | Hex | Use |
|---|---|---|
| paper | #F1F2EC | page background (pale sage, NOT cream) |
| ink | #212A20 | text, dark receipts band |
| green | #35573C | accent, CTAs, links, rail nodes |
| green-deep | #27402C | hover states |
| clay | #B4552B | whisper accent ONLY: Stick node, selection, footer favicon dot. Never a large surface |
| mist | #DFE2D5 | hairlines, card borders |
| faint | #5C6659 | mono labels |

## Type (locked)

- Display: **Bricolage Grotesque** 700/800, tight tracking (-.02em range). Headlines only.
- Body: **Source Serif 4** 400/600. All prose.
- Utility: **IBM Plex Mono** 400/500, uppercase, .12-.14em tracking. Eyebrows, nav, labels, footer.

## Signature element

The FIND -> BUILD -> STICK left rail: vertical 2px mist line, 1rem nodes bordered green (Stick node = clay). The three-stage sequence is the page's information structure, not decoration. Numbered 01/02/03 because it is a real sequence.

## Voice rules (from positioning memory, non-negotiable)

- Headline: "Companies have AI now and little to show for it." + find/build/stick subline. Do not soften.
- No em dashes anywhere in copy. No AI-tell vocabulary (see document-output.md blocklist).
- Never "solo-built" for ConvoWize (lead developer, built with two partners).
- No client names without permission (anonymous descriptions: "commercial real estate firm", "e-learning vendor").
- Don't lead with "adoption/enablement"; adoption is the stage-3 differentiator.
- Real numbers only (21 years, 20,000-person org, thirteen years ID).

## Motion

Two things move: text fades up as it always has (.reveal -> .in via IntersectionObserver), and the page's own lines draw themselves once as each section arrives, then stay still.

- Hero: a 2px underline passes under find, build, make them stick (green, green, clay) and leaves nothing behind.
- Rail: green runs from each node down to the next, the ring closes (clay at Stick), then the green drains and leaves the mist line.
- Receipts: one paper-colored line crosses the dark band and leaves the three rules behind it. This is the one bright moment. Nothing else competes with it.
- Engagement cards: each outline is drawn in green and relaxes into the mist hairline as the fill arrives.
- Contact: the green rule extends from the left and stays.

Rules for any line work: hairlines only, and only lines the page already has (the hero underline is the one stroke with no resting element, and it does not persist). Each draws once, on arrival, and never replays. The settled page must be pixel-identical to the page with no motion at all. Easing is cubic-bezier(.45,0,.25,1) for a draw and cubic-bezier(.65,0,.35,1) for a pass, 0.4s to 1.6s.

prefers-reduced-motion, print and no-script: everything visible, nothing drawn, no transitions. No parallax, no scroll-linked movement, no loops, no animated gradient surfaces.

## Quality floor

Responsive to 390px, visible focus (3px clay outline), semantic landmarks, OG tags, inline SVG favicon (three-node rail mark). No emojis in code. No external deps beyond Google Fonts.
