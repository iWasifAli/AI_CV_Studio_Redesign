# Premium CV Template Scout: daily workflow

**Schedule:** every day at 00:00, Asia/Karachi, as a scheduled task in Claude. Each run is a fresh session that follows this file.

**Goal:** 2 exceptional, genuinely new graphic CV designs a day. If the day yields fewer, report the shortage. Never lower the bar to fill the quota.

## Roles: discovery and decision are separate

| Role | Who | May | May not |
|---|---|---|---|
| **Scout** | The scheduled session | Research, check the registry, build proposals on branch `scout/<date>` (as drafts), render previews, write proposals | Approve, merge, change existing designs |
| **Reviewer: main development thread authority** | A fresh agent started by the run, given only this file, the contract, the rubric, the registry, the catalogue sheet and the previews. It sees none of the scout's reasoning. | APPROVE or REJECT each proposal and record the reason | Be swayed by the scout's own scores |
| **Implementer** | The scheduled session, after approval | Polish the approved design to ≥ 9.5, run every gate, open a PR, and merge it as a **draft** design when complete | Merge anything incomplete or unapproved; switch a design live (the owner does that in Admin → Designs) |

The main development thread wrote and owns this workflow, the contract and the rubric. The reviewer exercises that authority under them. When the owner is back in the main thread, it reviews the day's decisions and can overturn any of them.

## Steps of one run

1. **Set up.**
   - Check out `main` of `nisar87/AI_CV_Studio_Redesign`, then `npm ci`.
   - Set `CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome`.
   - Run `npx tsx scripts/scout-registry.tsx` to refresh the list of existing designs.
   - Read `docs/catalogue/discovery-registry.json`: every past proposal, every decision, and the `learnings`.
   - Look at the whole catalogue: `public/templates/*.webp`.
2. **Find gaps.** Write down which professions and visual languages the catalogue and the registry do not cover yet, and what earlier rejections teach. Aim the research there; never at another variant of a popular layout.
3. **Research** with web search and page fetches.
   - Sources: Behance, Dribbble, résumé design galleries, editorial and magazine design, annual reports, infographic and data-design work, portfolio sites.
   - Gather 6–10 candidate ideas, each with links to the references and the specific idea that makes each one exceptional.
4. **Filter against uniqueness** (strict).
   - The concept must differ in **layout architecture, graphical language, composition, hierarchy or content presentation**. Colour, gradient, font, icons, decorative shapes, sidebar side or spacing do not count.
   - Compare with every existing design (its `structure` in the registry) and every past proposal, approved or rejected. A rejected concept under a new name is a repeat.
   - Give each candidate a `structureKey`: a few words naming its architecture, for example "masthead grid with numbered pull-quote column". Run `npx tsx scripts/scout-registry.tsx --check` after adding candidates; it fails on repeats.
5. **Choose at most 2.** Each must plausibly reach 9.5/10 and be buildable by contract Route 1 or Route 2.
6. **Build each in the engine** on branch `scout/<date>`, following `TEMPLATE_CONTRACT.md`. Status stays `draft`. Run `npm run design:check -- <id>`, then `npx tsx scripts/design-preview.tsx <id> docs/catalogue/scout/<date>/<id>`.
7. **Write the proposal** in `docs/catalogue/scout/<date>/<id>.md`:
   - **A. Concept:** name, audience, design philosophy, why it deserves a place.
   - **B. References:** links, and the idea taken from each. Inspiration only.
   - **C. Preview:** the contact sheet and page images.
   - **D. Engine plan:** route, blocks or new module, spec values, risks.
   - **E. Uniqueness:** the nearest existing design, its distinctness number, and what is structurally new.
   - **F. Scores:** the scout's own rubric scores, with honest weaknesses.
8. **Review.** Start the reviewer as a separate agent. For each proposal it records `APPROVE` or `REJECT` with reasons in the registry (`decision`). It is highly selective; "it's nice" is not enough.
9. **Implement approved proposals.** Loop at most 5 rounds:
   - fix what the last review found;
   - render the previews again;
   - export PDFs (`/api/pdf` or the gates);
   - ask a **new** reviewer agent to score them with the rubric.

   The design is **complete** only when every criterion is ≥ 9.0, the average is ≥ 9.5, every gate passes and CI is green. Then open a PR to `main` that adds the design as a draft, wait for CI, and merge. Otherwise mark it `incomplete` with its blockers, leave the PR open and don't merge.
10. **Learn.** Add 1–3 short lessons to `learnings` in the registry: what got approved or rejected and why, and which gaps remain.
11. **Report** in `docs/catalogue/scout/<date>/REPORT.md`, plus the PR description, covering:
    - the 2 designs and their sheets;
    - the references;
    - uniqueness and scores;
    - the decisions and their reasons;
    - the implementation status and final scores;
    - what remains open;
    - the registry changes.

    Push branch `scout/<date>`. Its registry and report are always merged to `main` (documentation only; unapproved designs are removed from that merge).

## Quality rubric (0–10 each; the reviewer scores from the renders and PDFs, never from code)

| Criterion | 10 means |
|---|---|
| Visual sophistication | Looks like a top designer's paid template; one strong idea, executed throughout |
| Originality | No design in our catalogue or in common template shops has this structure |
| Graphical quality | Artwork is sharp, purposeful and balanced, and never competes with the text |
| Typography | Clear scale, rhythm and pairing; long names and dense pages still look set by hand |
| Layout and information hierarchy | Name → role → sections → entries → details reads at a glance, on 1 page and on 3 |
| Professional suitability | A recruiter in the target field would take it seriously |
| Engine compatibility | Route 1 or a clean Route 2 block; every gate green; the person's colour and the themes all work |
| Print/PDF quality | PDF matches the preview; fonts are embedded; no clipped art; breaks are clean on A4 and Letter |

**Anchors:**
- **9.5:** nothing to improve that a professional designer would insist on.
- **9:** excellent, with minor nits.
- **8:** good but ordinary.
- **7:** generic.
- **≤ 6:** flawed.

**Caps:**
- Any visible defect (overlap, clipping, broken word, empty column, an orphan heading) caps the score at 8.
- A concept that is only a re-decoration of an existing design caps originality at 5.

"Tests pass" is never evidence of visual quality.

## Safety

- Never reproduce a specific published template, its artwork, its name or its brand.
- Never add designs as `live`.
- Never touch site settings, payments or user data.
