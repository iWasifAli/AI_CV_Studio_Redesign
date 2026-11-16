# Requirements gap audit (16 Nov 2026): what is real

Each finding was checked against the code and fresh renders before anything was changed. Verdicts:

- **Real:** a defect or gap, fixed in this release.
- **Partly real:** the finding is right in part; what was fixed and what wasn't is stated.
- **Owner:** needs the owner's information, people or a product decision, not code.
- **Not a gap:** working as designed, with the reason.

## Fixed in this release

| ID | Verdict | What was checked | Change |
|---|---|---|---|
| G-01, U-01 | Real | The vocabulary has square bullets, numbered headings and dates on the left, but nothing checked the model's answer against the description | New `design/requests.ts` reads the requests a description makes (bullet shape, heading style and case, name case, date position, skill style, paper, photo shape, header band, centred name, which column a section goes in). Each candidate is held to them: a request the model missed is applied; one the design rules can't honour is named with the reason. Each card now says "Done from your description: …". The auditor's own sentence is a unit test: square bullets, numbered headings and dates-left are applied, and "Education stays in the main column" is explained |
| G-02, row 48 | Partly real | A normal email (25 characters) broke at the @ in Atelier, Harbor and Folio: Chrome breaks at `<wbr>` hints even under `nowrap`. Very long emails (40+ characters) cannot fit a 45 mm column at a readable size | Emails and phone numbers are printed without break hints and shrink (to 80% at most) to stay on one line. Only an address too long even then may break, at its dots and @. The ATS check is now strict: an email that only comes back split over two lines fails with "Your email is split over two lines" and points to the ATS PDF. Result: the 25-character email is on one line in all 52 designs; 40-character emails still split in 19 narrow-column designs, and the check now says so |
| G-03, S-03 | Real (partly) | "Years of experience" counted volunteering, internships and military service, so the graduate CV showed "04". The engineer's "16" was a correct count of the CV's dates but contradicted the profile's "14" | Years now count paid work only (part-time, volunteer, intern and placement roles excluded), and the person's own figure in the profile or headline ("14 years") wins. Roles count paid jobs only. The graduate CV now shows no derived numbers. Kept: plain counts of what is on the CV (languages, certifications, projects) |
| G-06 | Real | 7 graphic designs put the graduate CV on two pages. Page 2 was a little over 30% full, so the fit steps (which only run below 30%) never tried | With G-03, two of them fit at once. The fit steps now also try when a two-page CV's second page is under 40% full (still bounded: text never below 9.5 pt, kept only if it saves a page). All 20 graphic designs now fit the graduate CV on one page |
| G-07 | Real | The rail designs kept an empty third-width rail on every continuation page (`keepColumns`) | As in the core designs: once the rail's content ends, later pages go full width with a 4 mm strip of its colour, and the running header moves to the full width |
| G-08 | Real | The rules-based import dropped a monogram; the AI path did not, so "DO" became an "Other" section | The shared import tidy step drops lines that are only the person's initials or under 3 letters and digits, on both paths. Unit-tested |
| G-09 | Real | The makeover's first pick was Cyber for the engineer and Graphite for the executive | A Creative graphic design can still appear in the strip of six but is never pre-selected. Unit-tested over all sample CVs |
| G-11 | Real | Mosaic and Matrix gave a rail to a single certification | Rails are first rebalanced (sections with content shared between the two rails, biggest first). Only if a rail would still hold under about 150 characters does the page become two columns, with a note in the Design tab. Teacher, nurse and long CVs keep three columns; engineer, graduate and executive CVs get two |
| G-15 | Real | The composition gate was not in CI | Added to `ci.yml` |
| G-16 | Real | The home page told signed-in people their CV lives only in the browser | Reworded for both cases |
| U-02 | Real | The home page promised every design is read by ATS, while the gallery labels 20 designs Creative | It now says each design comes with a plain one-column ATS version for online forms |
| G-10 | Real, partly fixed | `Server-Timing` on the PDF response showed the cause. On production the PDF itself renders in 0.33–0.45 s. Before this release a warm request took 3.2–3.7 s on the server: 1.5 s in the allowance check and 0.9 s in usage counters | The plan is read once per request; settings, plan and usage are read side by side; counters update after the PDF is sent. Warm server time is now 2.1–2.6 s (4 runs). What remains is about 0.4 s per database read, very slow for one document read. The server runs in europe-west4; staging's database is recorded as nam5 (US). If production's database is in the US too (Firebase Console → Firestore → location), every read crosses the Atlantic. Fix (owner decision): run the server in the database's region, or move the data to a European database. Cold starts (7–9 s on the first call) need `minInstances: 1`, which has a monthly cost |
| G-19 | Partly real | The corner shape is a deliberate decoration inside the margin, but it repeated on every page | Shown on page 1 only, like the dot-grid decoration |

## Not changed, and why

| ID | Verdict | Reason |
|---|---|---|
| G-04 | Owner | 40 real CVs, a 30-person preference test and two outside reviewers need real files and real people. Hiding designs under 8.5 is a switch in Admin → Designs once scores exist |
| G-05 | Owner (product decision) | The 20 graphic designs are 4 structures. Presenting each structure as one design with colour themes is a product choice (the gallery would show 36 designs instead of 52). Recommended, but not decided for you |
| G-12 | Not a gap for users | Three engines is an architecture choice with a real cost (every engine-level fix is made two or three times; G-07 is an example). New designs should be spec data only, but rewriting 30 working designs is not worth the risk now |
| G-13, S-10 | Owner | The privacy page needs the legal name, address and retention periods |
| G-14 | Real, deferred | A nonce-based `script-src` needs every page rendered per request (no static pages) and testing against Firebase sign-in. It's a security hardening step, not a known hole: no user input is rendered as HTML |
| G-17 | Ops | `/api/health` shows the commit only if the host passes it in. App Hosting doesn't by default; it needs a build variable in the hosting config |
| G-18 | Real, low impact, deferred | The start-from-a-description step picks among 30 designs, not 52. The person picks from the full gallery right after, and widening it changes a schema three AI tasks share |
| Row 20 | Not a gap | The designed PDF follows its visual layout (side-column contact after the main column). The ATS PDF puts contact first for online forms |
| Row 31 | Not a gap | The top-third rule's relaxed limits for graphic and four other designs are recorded deviations for designs labelled Creative |
| Rows 43, 44, 54, 58, 63 | Real, low priority | Comments drawn on the page, profile sync for edits and removals, streamed coach replies, publishing the extension, interface dark mode |
| S-01, S-02 | Real (missing features) | Editing CV content by instruction, and creating a CV from a free-text description, are genuinely missing and valuable. They are new features, not fixes, so they wait for the owner's go-ahead |
| S-08 | Owner | Testing through real application systems (Workday, Greenhouse) needs real application forms |

## Follow-ups after the auditor's re-check (16 Nov 2026, commit `acc6b25`)

| Point raised | Change | Checked |
|---|---|---|
| Long emails still split in narrow side columns | The editor now warns under the page count: the email is too long for this design's side column, and designs with contact details across the top keep it whole. Not done: moving the line to full width automatically, which would re-flow an already paginated page differently in each engine. Found and fixed on the way: a fit pass left earlier break hints in place, so a long email could wrap without being detected | New e2e test (desktop and phone): a 68-character email in Atelier shows the warning, a normal one does not |
| "Using skill tags instead" while the saved design keeps bars | Deliberate: the person asked for bars, and they appear once skills have levels. The note now says exactly that | — |
| `/api/health` reports "dev" | Reports the built commit, or Cloud Run's revision name if the build has no git | Live: `"version":"acc6b25"` |
| Designer 11.5 s against an 8 s target | One run, not a median. The compose task already runs with minimal thinking. The allowance check that slows PDFs (1.1–1.4 s of database reads) runs before every AI action too, so the database-region decision under G-10 affects the Designer as well | Not changed |
