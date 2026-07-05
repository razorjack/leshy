# ADR-0005: Visual identity — the watcher in the woods, boldness 5/10

Status: accepted

## Decision

Leshy is the Slavic forest spirit that watches everything that moves through its woods.
The identity is built on that single idea — **a calm, watchful presence** — expressed
through one signature move and a disciplined palette. Trust reads as restraint: a privacy
tool must feel inevitable, not decorated.

### The one signature move: the watcher mark

An eye formed by two leaf arcs with a round pupil (`public/favicon.svg`,
`Wordmark.svelte`). It is the favicon, the PWA icon, the header mark, and (later) the
scanning indicator — the eye is _open_ while detection runs. It appears nowhere else;
no pattern fills, no repeated motifs. Motion is limited to a slow blink of this mark
during scanning, disabled under `prefers-reduced-motion`.

### Palette (full token sheet lives in `src/app.css` — that file is the source of truth)

Dark is the reference theme; light is a first-class sibling, not an inversion.

| role             | dark                                      | light                            |
| ---------------- | ----------------------------------------- | -------------------------------- |
| background       | near-black green `oklch(0.165 0.018 165)` | bone `oklch(0.972 0.008 95)`     |
| foreground       | bone `oklch(0.92 0.012 95)`               | ink-green `oklch(0.24 0.02 160)` |
| primary          | lifted pine `oklch(0.68 0.11 155)`        | deep pine `oklch(0.42 0.09 158)` |
| secondary        | moss shadow `oklch(0.30 0.035 140)`       | lichen `oklch(0.90 0.035 125)`   |
| mark (highlight) | pine @ 16% alpha                          | pine @ 13% alpha                 |

The green tint runs through _every_ neutral (backgrounds, borders, muted text sit at hue
150–165 with chroma 0.012–0.04) — that, not any single loud element, is where the 5/10
boldness lives. No stock slate anywhere.

### Type

- **Display**: Fraunces (variable, SIL OFL, self-hosted woff2, latin + latin-ext) — a
  wonky-organic serif for the wordmark and `h1` only.
- **UI**: system-ui stack. **Data panes**: system mono stack. The user's pasted bytes are
  the interface; typefaces defer to them.

### Replaced-token highlight

`<mark>` with moss-tint background (`--mark`), 1px dotted underline in `--mark-border`,
no color-only signalling (shape + tint), entity label on hover via tooltip. Legible in
both themes over mono text; never animated.

### Voice

One line, used in the footer and empty state: **"Nothing leaves the woods."**

## Alternatives rejected

- Bark/texture backgrounds, forest illustrations — pushes past 5/10 into theme-park.
- Displaying the eye per replaced token — turns the output pane into noise; the token
  highlight must recede so the _text_ stays readable.
- Neutral gray dark theme with green accents only — indistinguishable from every other
  developer tool; the tinted neutrals are the identity.

## Consequences

- All theming flows through the shadcn token names (`--primary`, `--mark`, …) mapped in
  `@theme inline`; components never hardcode color.
- Fraunces adds 127 KB (two woff2 subsets), self-hosted — no external font request, CSP
  stays `'self'`.
- Icon changes are one SVG + `npm run icons` (rasterizes committed PNGs).
