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
