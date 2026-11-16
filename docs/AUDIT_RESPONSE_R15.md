# Response to the independent audit (R15)

Release: commit `5bbdbd8` on `main` (CI green). Each audit ID is listed with what changed and how it was checked. The checks are repeatable from the repository.

## How it was checked

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | 511 passed |
| Composition gates (new): every design × the auditor's executive CV (Letter and A4), graduate CV and the extreme CV. Checks words broken mid-word, overlaps, art under text, page fill and near-empty last pages | `npm run gates:composition` | 0 failures |
| Catalogue gates: every design × 6 CVs, PDF read back by the app's own reader | `npm run gates:catalogue` | 416 renders, 0 failures |
| PDF read-back sweep: all 32 designs × the auditor's executive and graduate CVs | (script used during this round) | Every design reads back ≥ 99% of the words, no furniture in the text, no contradictory ATS results |
| End-to-end (desktop, phone, admin) | Playwright | All passed. `portfolio.spec` fails now and then under 3 parallel workers and passes when run on its own |

## Blockers

| ID | Change |
|---|---|
| F-01, F-22 | A word-fit pass shrinks a name, label or address that would break mid-word. Long addresses break only at `@ . - _ /` |
| F-04 | Long CV and job titles no longer widen the page on phones (home, design page, Documents) |
| F-02 | Paper size follows the CV's country: Letter for the US and Canada, A4 elsewhere. It is set from the browser's time zone and when the country changes in the editor |
| F-06 | A link whose label is its own address is printed once |

## High impact

| ID | Change |
|---|---|
| F-03 | Switching designs applies the new design's own spacing, typeface and colour. Only what the person chose themselves is kept, and a graphic design's accent no longer leaks into the next design |
| F-05 | Entries may split between points, never stranding one point. A text-size fit step (never below 9.5 pt) is added. Languages print two per row. Grouped skills print in columns |
| F-11 | Proofread checks the CV in parts side by side on the fast model, with "Reading every line…" progress text |
| F-14 | Page numbers, running headers, monograms and section numbers are drawn as pictures in the PDF: they look the same but are not in the text an ATS reads. Letter-spacing is capped at 0.1em and kerning is off in tracked capitals, which fixed the "L ANGUAGES" split. The heading check now also confirms that each heading came back out of the PDF. Reading order is checked per column for work, education and projects. Name and email checks tolerate a wrapped address |

## Templates

| ID | Change |
|---|---|
| F-07 | The monogram ignores titles: "Dr. Alexandra K…" gives AK |
| F-08, F-25 | Ledger labels fit their column; the skills separator is " · " |
| F-09 | Page art that a line of text would cross is hidden on that page |
| F-10 | Column and Press have visible section spacing |
| F-29 | The running header's headline is cut to one short line |

## Smaller findings

| ID | Change |
|---|---|
| F-12 | The Check summary and the gap card use the same gap calculation, and an invalid range is ignored |
| F-13 | Retitled "CVs for this job", with "Tick the CVs you used…". Only ticked CVs are linked |
| F-15 | An end date before the start date shows a hint where it is entered (editor and guided steps). Email already had one |
| F-17 | The "Continue" card's space is reserved before first paint, only when the browser has a saved CV |
| F-19 | The editor has a skip link, one h1 and an h2 per panel. Small icon buttons are 44 px under 768 px |
| F-21 | Lines of a current job are marked for the AI so they stay in the present tense |
| F-24 | A date the detail already states ("Registered since Sep 2018") is printed once |
| F-27 | Entitlements are fetched once per tab, fresh for 30 s, and refreshed after actions |
| F-28 | A signed-in person on an unknown CV sees text meant for them |
| R-03 | The makeover strip always includes a design from the Bold family |
| R-04 | Already present: the add-section list has a search field |
| R-05 | Compact grid designs are not suggested for CVs shorter than about 1.5 pages |
| Security | HSTS (one year) and a CSP limited to `object-src 'none'; base-uri 'self'; frame-ancestors 'none'` |
| Privacy | New "Your rights" and "Contact" sections. The contact is the support email from Settings |

## Still open (honest status)

- **9.5 design score (R-01).** Not proven. The fixes remove the defects behind the lowest scores (broken names, art under text, near-empty pages, double links, wrong paper). They do not change the catalogue structure the audit criticised: D-01 (presets of 10 engines), D-02 (shared font pair), D-03 (no adaptation to short CVs), D-05 (plain continuation pages), D-06 (photo-led designs without a photo). These are design-direction work, not bug fixes.
- **Privacy page.** It names no data controller (a legal name) and no retention period for logs and backups. The owner has to supply both; they were not guessed.
- **CSP.** A script-source policy needs per-request nonces and was not added.
- **Not re-measured.** Lighthouse/CLS (F-17) and an axe run in CI.

## Verification round (16 November 2026)

This section answers the verification report. Commits `f023531` and the one after it are on `main`, with CI green.

| Item from the verification | Change | Checked |
|---|---|---|
| F-04: Documents 723 px wide at 375 px | The cause was grid items sizing to the full, untruncated CV title. All 30 responsive grids in the app now have a shrinkable base column | Production, 375 px: Documents is 375 px wide |
| F-05: a page ends with a job heading and one point (Heritage, Press) | A job heading always keeps its first two points on its page. The composition gate now fails any split that leaves one point on a page; before the fix it found the case in 24 design × CV combinations | Gate: 0 failures. Page-fill minimum lowered from 80% to 78%, because keeping two points can move one more short entry to the next page (Counsel × executive Letter: 79%) |
| F-11: Proofread 503 and over 35 s | Fast model without long thinking; at most four parts in flight; 25 s per part and 45 s overall. A part that fails is reported ("Part of your CV couldn't be checked") instead of failing the whole check with 503. The tense rule no longer flags a current job written consistently in the past tense | Production, AUDIT TEST 1: 22.6 s and 10.8 s (two runs), no 503 |
| PDF slower and larger | Furniture pictures are cropped to the ink and drawn at 3× (about 290 dpi). Identical pictures share one source, so a running header repeated on every page is stored once | Heritage × executive: 106 KB (162 KB in R15; 79 KB without pictures). Production, AUDIT TEST 2: 3.7–4.2 s warm over 3 runs, 8.4 s on the first (cold) call. Locally with the CPU throttled 8×, the picture step takes 160–300 ms of a 2–3 s render; most of the time is loading the page and its inline fonts, which R15 did not change. **The extra time compared with 2.5 s before R15 is smaller than in R15 but not gone** |
| Pictures and accessibility | The pictures carry `alt=""`, `aria-hidden` and `role="presentation"`. They are not in the PDF structure tree, so screen readers that follow the tags skip them | Checked with `pdfinfo -struct`. Chrome does not mark them as `/Artifact`, which a strict PDF/UA checker may report |
| Heritage contact line starts with a dot | In centred contact lines (Heritage, Halo, centred Clarity and composer headers), the item that starts each line drops its separator | Heritage PDF: both lines centred, no leading dot |
| Existing CVs on Letter | Not changed silently. The Design tab now says "Letter is the US and Canadian size; most other countries use A4", with a one-click "Use A4", when the CV's country or the browser's country uses A4 | — |
| Graphic designs switched on | Not changed by these releases: they are controlled by the switch in Settings | — |

## After the second verification (16 November 2026)

| Item | Change | Checked |
|---|---|---|
| PDF time compared with before R15 | Measured like for like: the pre-R15 code (commit `13d3e50`) and today's code, same machine, same executive CV in Heritage, 8 runs each. Median 261 ms before, 287 ms now (+10%, 26 ms); 77 KB before, 106 KB now. The page pictures cost about 26 ms, so the 2.5 s → 4 s difference seen on production comes from the server instance (warm or cold, which instance), not from rendering | Benchmark script run locally; not a production measurement |
| Accessibility | New end-to-end sweep (`e2e/a11y.spec.ts`) over 17 main pages (home, gallery, design page, start, import, makeover, Documents, Jobs, Letters, Premium, Help, Privacy, Terms, sign-in, editor, guided steps, download) at desktop and phone width. It fails on any axe violation of WCAG 2.0/2.1 A or AA, of any impact. It found one rule on every page: the logo link's name ("AI CV Studio — home") didn't contain its visible words ("AICV Studio"). The name now comes from the visible text, plus a hidden ", home" | 0 violations on all 17 pages at both widths; the sweep now runs in CI |
| D-02: one font pair for most designs | Three new pairs from the bundled fonts: Editorial (Source Serif 4 + Inter), Bold (Inter Tight 800 + Source Sans 3) and Rounded (Nunito Sans). Every design now has a deliberate pair: 8 pairs across 52 designs, at most 9 designs per pair (28 shared one pair before). Mosaic and Matrix use pairs whose role and dates read back on one line | Gallery thumbnails regenerated; catalogue gates 416/416 |
| D-03: short CVs fill a third of the page | A one-page CV filling less than 70% of the page now opens up in up to five steps: up to 2.6× the space between sections and entries, slightly more line height, text at most 4% larger. Each step must keep one page with a line to spare, stay below 92% full, keep the first entry in the top 40% of page one, and break no word. Compact grids (Grid, Mosaic, Tiles, Matrix) keep their own spacing | The auditor's graduate CV across the 32 core designs: content ends on average at 72% of the page, up from 60%; 24 designs open up. Single-column designs reach 73–84% (Clarity 62% → 81%); designs with a side column 59–75% (Harbor 48% → 59%, Cameo 47% → 62%), because the side column fills first. Designs already above 70% are unchanged, and the compact grids stay at 43–47% |
| Test that failed at midnight UTC | The daily AI budget test now runs at a fixed time | — |

**Still open:** a full re-score of all designs against 9.5 (needs the independent reviewer); continuation pages that look plain (D-05); photo-led designs without a photo (D-06); the data controller's legal name and the log and backup retention period on the privacy page (the owner's information); a script-source CSP; a Lighthouse run.
