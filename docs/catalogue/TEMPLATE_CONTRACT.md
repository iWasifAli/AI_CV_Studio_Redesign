# HTML Template Implementation Contract

This contract binds the **Premium CV Template Scout** and anyone who builds a template. It was written from the engine as it is (commit after e54264a). A proposal that does not follow it is rejected without review. Standalone HTML pages, mock-ups in other tools, or a new rendering architecture are never accepted.

## 1. How a design gets into the product: two routes only

**Route 1: a design file (preferred).** The design is one file, `src/modules/design/data/<id>.json`. It contains:
- its words: name, style, description, tags, family and fit;
- its look: a Design Spec, as defined in `src/modules/design/spec.ts`.

It uses only values the spec already has, including the graphic building blocks (`spec.graphic`: poster, band, rail, cover). Tools: `npm run design:new -- <id> --like <design>`, then `npm run design:check -- <id>`. Guide: `docs/TEMPLATE_AUTHORING.md`.

**Route 2: a new building block, then a design file.** Use this when the concept needs a page structure the engine cannot draw yet, for example a masthead grid, a vertical timeline spine with a portrait, or a magazine column with pull quotes. Add it the way the four graphic layouts were added:

1. Add a layout module, `src/modules/templates/graphic/<layout>.tsx`, that exports `<layout>Template(config): CatalogueTemplate`. Follow `spot.tsx`, and reuse the shared parts in `parts.tsx`: `SplitName`, `Portrait`, `KeyNumbers`, `Monogram`, `heading()`, `graphicHooks()` and `StackedContacts`.
2. Add a variant to `graphicSpec` and `GRAPHIC_BLOCKS` in `spec.ts`, holding its options (frames, art and so on) as closed lists.
3. Map it to its config in `compose-graphic.ts`.
4. Give it a signature in `distinctness.ts` (`graphicSignature`).
5. Add it to `randomGraphic` and `enumSweep` in `samples.ts`.
6. Then the design itself is a design file (Route 1).

Rules for Route 2:
- No existing design may change. `render-identity.test.ts` must pass without re-recording.
- A building block must take options. A single fixed look is not a building block.

## 2. What a template is (engine facts)

- **One self-contained HTML document**, built by `buildDocumentHtml()`. The same string is shown in the preview and printed to PDF by Chromium. Templates are React components rendered to static markup.
  - Templates contain no scripts. The paginator runtime is the only script.
- **Template parts** (`TemplateDefinition` in `templates/types.ts`):
  - `Header`, `Running` (the header on continuation pages), `AsideTop` and `AsideContact`, `MainEnd`, `Decor`.
  - `css` (a string), `hooks` (how headings, entries, skills and lists render).
  - Which sections sit beside the main column: `asideKinds`, `thirdKinds` and `keepColumns`.
  - `photo`.
- **Data: only what is in `RenderModel`** (`templates/render-model.ts`):
  - `name`, `firstName`, `lastName`, `initials` and `headline`.
  - `photo`: a data URL, or `''`.
  - `contacts[]`.
  - `sections[]`: entries with `title`, `subtitle`, `meta`, `dates`, `bullets`, `tags` and `label`.
  - `locale`.
  - `stats`: at most 3 honest key numbers.

  Never invent content: no fake ratings, no skill levels the person did not give, no logos, no filler text.
- **Every design must handle every case:**
  - with and without a photo (use `fallback: initials` or design the space away);
  - a name only (the sparse CV);
  - very long names, emails and URLs (the extreme CV);
  - 1 to 4 pages;
  - A4 and Letter.

## 3. CSS conventions

- **Colour comes from variables, never from fixed values.**
  - `--accent`: text-safe, at least 4.5:1 on white.
  - `--accent-raw` with `--on-accent-raw`, for fills.
  - `--accent-soft`, `--accent-tint`, `--accent-line`, `--accent-deep`, `--accent-bright`.
  - Graphic layouts also use `--g-ink`, `--g-soft` and `--g-hot`.

  The person's own colour and the six colour themes must all look right.
- **Type comes from the font pairs** (`FONT_PAIR_IDS`): `--font-heading`, `--font-body` and `--heading-weight`.
  - Body size is `--fs`, never below 9.5 pt. Line height is `--lh`.
  - No other fonts: the CSP allows only our embedded fonts.
- **Spacing goes through the fit variables**: `--fit-gap`, `--fit-margin`, `--fit-fs` and `--fit-lh`. The paginator shrinks and grows content with them, so a fixed `margin` or `padding` breaks fitting.
  - Page size comes from `--page-w` and `--page-h`. Pages are `.cv-page`. Content flows, and page breaks are the runtime's job.
- **Artwork is inline SVG or CSS shapes only.**
  - Images are `data:` URLs only (CSP: `img-src data:`). No external URLs.
  - Canvas is flattened to images for print.
  - Decoration must never sit under text (composition gate).
- **Contrast:** text is at least 4.5:1 against its background; large display text is at least 3:1. `readableTones` enforces this for `ink` and `soft`.
- **Budgets:** see `docs/engineering/template-authoring-guide.md` §2. In short:
  - the name and headline sit in the top 40% of page one;
  - the first job starts by 62% (graphic designs);
  - side columns are 24–40% wide;
  - nothing smaller than 7.5 pt except the page furniture.

## 4. What every design must pass (automated, all mandatory)

| Gate | Command |
|---|---|
| Design file valid, registered, thumbnail, fingerprint | `npm run design:check -- <id>` |
| Parity, fonts embedded (no Type 3), top third, PDF read-back ≥ 97%, text order of the ATS version | `npx tsx scripts/catalogue-gates.tsx <id>` |
| No broken words, no art under text, page fill, no split entries | `npx tsx scripts/composition-gates.tsx <id>` |
| Structurally distinct (≥ 0.25 from every live design; decoration counts little) | `npx tsx scripts/distinctness.tsx --with <id>` |
| Everything else unchanged | `npx vitest run` (includes render identity, contrast and the random-spec property tests) |
| Full CI | push the branch; CI must be green |

## 5. Previews

A preview comes from the engine and nothing else:

```
npx tsx scripts/design-preview.tsx <id> docs/catalogue/scout/<date>/<id>
```

It renders, with photos, a short CV, a typical CV, a long CV (2 pages), a dense executive CV (3 pages), a sparse CV and the ATS version, plus a contact sheet. A concept that cannot yet be drawn because it needs Route 2 is built as a Route 2 prototype on the scout branch and previewed the same way.

## 6. ATS

Every design keeps the engine's plain ATS version, made automatically by `atsSafeSpec`. A design whose own PDF does not read in order is labelled "Creative — plain ATS version included". That is fine for a graphic design, but it must say so honestly.

## 7. Originality and sources

References are inspiration only. Never reproduce a specific published template, its artwork, its name or its branding. A proposal must describe what is taken as an idea (for example, "a magazine masthead grid") and how our composition differs. Colour, font, icons, decorative shapes, sidebar side and spacing never make a concept new, and neither does a new header alone. The body must be structurally new too (see the whole-template rule in `SCOUT_WORKFLOW.md`).
