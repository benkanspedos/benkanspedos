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

Two things move. Nothing else does.

- Scroll reveals (.reveal -> .in via IntersectionObserver).
- The thread: one 1px green hairline, drawn down the page as it is scrolled and never undrawn, led by a 6px dot (green, paper on the dark band) that goes when the line is complete. It starts at the Find node and turns the rail green (each node takes a 6px centre dot as the thread reaches it), steps out to the page margin, inks the receipt rules, runs down the far margin, inks the contact rule and ends at the email button. Where the receipts stack (768px and under) it snakes through them, one rule per pass. Every rule it reaches is inked at that rule's own weight and colour, so the finished page is the static page plus the hairline, a green rail and dotted nodes. Corners sit in the page margin or under the rail, never over text.

One flourish, and only one: on the dark band each receipt rule arrives lit in paper as it is drawn, then settles to its own colour.

prefers-reduced-motion (and forced colours): the thread is never built. Everything visible, no transitions, the static page as designed. If the thread's script ever fails it hides itself and the static rules return. No parallax, no gradient animation.

## Quality floor

Responsive to 390px, visible focus (3px clay outline), semantic landmarks, OG tags, inline SVG favicon (three-node rail mark). No emojis in code. No external deps beyond Google Fonts.
