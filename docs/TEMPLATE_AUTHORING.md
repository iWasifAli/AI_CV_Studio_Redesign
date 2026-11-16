# Adding a design: one data file

New designs are **data, not code**. A design is a single file in `src/modules/design/data/<id>.json`; the composer draws it. You do not write layout code, CSS or a template for a new design. (Hand-written templates and the engine rules behind them are covered in `docs/engineering/template-authoring-guide.md`. Read §2 and §3 there for the budgets every design must respect.)

## 1. Create, check, publish

```bash
npm run design:new -- lagoon --like neon     # starts from an existing design's look
# edit src/modules/design/data/lagoon.json: name, style, description, tags, look
npm run design:check -- lagoon               # run again after every edit
npm run design:remove -- lagoon              # throw it away again
```

`design:check` does every step and prints PASS or FAIL for each:

| Step | What it proves |
|---|---|
| design file is valid | Every field and spec value is allowed. Nothing falls back silently. |
| name is unique, id is new | Two designs never share a name; built-in ids are never reused. |
| registered | `data/index.ts` is regenerated (never edit it by hand). |
| thumbnail rendered | `public/templates/<id>.webp` is written from a real render. |
| catalogue gates | For all six sample CVs: the preview and PDF page counts match, the fonts are embedded, the name and first job sit in the top third, the PDF reads back into the same CV, and the text order is right (including the ATS version). |
| composition gates | No word is broken mid-word, no artwork sits under text, the page is filled sensibly, and no entry is split across pages. |
| render fingerprint recorded | `render-identity.test.ts` will catch any later change to how this design draws. |
| distinct from every live design | The structural distance to the nearest live design is at least 0.25. Colour and font don't count. |

A new design starts as a **draft**: it is not shown anywhere. The owner switches it live in **Admin → Designs** and sets its tier and tags there. Admin saves are versioned and audited.

## 2. The file

```jsonc
{
  "id": "lagoon",                 // lower-case, digits, dashes; the file name is <id>.json
  "name": "Lagoon",               // unique, shown to people
  "style": "Calm spotlight",      // the short look label under the thumbnail
  "description": "One or two plain sentences on what makes it different.",
  "family": "graphic",            // clean | classic | sidebar | editorial | timeline | bold | portrait | compact | graphic
  "fontPair": "bold",             // the font the design starts with (people can change it)
  "accent": "#2bb3a3",            // the colour it starts in (people can change it)
  "fit": { "tech": 0.8, "student": 0.8 },   // kinds of work it suits, 0–1 ("Best for you" order)
  "photo": true,
  "tags": ["creative", "elegant", "photo-led"], // bold, elegant, minimal, creative, classic, photo-led, first-job, senior, academic
  "fallback": "neon",             // hand-written design used where only those work (Word export, letters)
  "status": "draft",
  "addedAt": "2026-11-16",
  "spec": { … }                   // the look: a Design Spec (src/modules/design/spec.ts)
}
```

`spec` holds every look option the composer has: layout, header, headings, entries, bullets, skills, decoration, colours, spacing and so on. The random-spec test and the gates cover all of them.

## 3. Building blocks for graphic designs

`spec.graphic` picks one of four graphic layouts and its parts. Every value below is covered by the enum sweep and the random-spec tests.

| Layout | `frame` (photo) | `art` | `numbers` (key numbers) | Also |
|---|---|---|---|---|
| `poster`: dark header, very large name, portrait standing on its edge | arch, circle, squircle, leaf, hexagon | rings, beams, dots, waves, blocks | band, cards, ruled | `side` (left or right), `caps`, `stop` |
| `band`: coloured band with a side rail | notch, circle, tall, slant, square | quarter, stripes, grid, ring, dots | box, columns, pills | `caps`, `stop`, `end` (bar, outline, none), `railMm` |
| `rail`: full-height rail with the portrait at its top | block, arch, inset, circle, split | gradient, solid, lines, dots, frame | — | `ornament`, `nameStyle` (heavy, light), `railMm` |
| `cover`: patterned cover with a contact strip | tilt, ring, diamond, blob, offset | hatch, grid, rays, confetti, bubbles | — | `side`, `caps`, `stop` |

Every graphic layout also takes:

- `marker`: the heading marker (bar, dot, slash, number, square, line).
- `skills`: the skill meter (bars, segments, dots).
- `ink` and `soft`: the dark and pale tones.

Readable tones are enforced: white text on `ink` and dark text on `soft` are kept at 4.5:1 or more. Key numbers only ever show figures the person entered.

People can recolour any design with the colour themes in the gallery. For graphic designs, a theme also replaces `ink` and `soft`.

## 4. Proof that this works

- **Neon rebuilt as data.** `src/modules/design/data/rebuilt/neon.json` draws exactly the hand-built Neon on all six sample CVs:
  - The HTML is identical apart from the design name (`design-data.test.ts`).
  - `npx tsx scripts/design-compare.tsx neon src/modules/design/data/rebuilt/neon.json` finds 0.000% differing pixels on every page.
- **A throwaway design added and removed (Lagoon, 2026-11-16).** `design:new` and `design:check` passed every step. The only files that changed were the design file, the generated index, its thumbnail and its fingerprint lines. No engine code changed. `design:remove` took it out again. Its thumbnail is kept at `docs/catalogue/throwaway-lagoon.webp`.

## 5. Before you switch a design live

- Look at it with the six sample CVs in the gallery: open the design, then use "Show the designs with".
- Run `npm run catalogue:distinct`. It writes `docs/catalogue/distinctness-report.md`, which lists the nearest pairs.
- Two designs that are too alike are only kept when the owner says so: add the pair to `src/modules/design/distinctness-accepted.json` with the reason.
