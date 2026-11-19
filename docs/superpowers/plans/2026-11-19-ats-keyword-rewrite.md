# One-click ATS keyword rewriting

Approved design: select missing keywords (selection confirms truth), apply natural rewrites to
the current document's profile and relevant visible work/project bullets in one undo step.
Any open document, including the career profile, is eligible. Implement on
`feat/workspace-tab-polish` alongside the completed navigation improvements.

## Task 1: Validate targeted replacements

- Test and implement a pure allowlist of profile and existing visible experience/project bullets.
- Validate at most 12 replacements for up to 25 selected keywords (60 characters each).
- Derive original text from the CV, reject invalid/duplicate targets, oversized text, placeholders,
  unsupported facts, and replacements introducing no selected term.
- Ground facts in the original passage and confirmed keywords, never the advert or another bullet.
  Preserve a fact-bearing original passage as a verbatim span; otherwise use another field or skip.
- Return validated patches, actual included terms, and skipped terms with explanations. Apply
  patches atomically against exact original text without changing IDs, ordering, design or metadata.

## Task 2: Guard editor and account lifecycle

- Add guarded snapshot capture and immediate commit interfaces to the existing editor. Verify
  persisted state before flushing and committing; reject conflicts, deletion and save failures.
- One commit creates one Undo/Redo step; preserve newer title/design changes. No delayed rewrite save.
- Scope editor history, requests and cleanup to the account session. Flush valid work before sign-out
  cleanup, revoke the departing editor and remount pages on account changes without restoring old undo.

## Task 3: AI endpoint and provenance

- Add internal task `quality.rewriteKeywords`, schemas, mock fixtures and language rules.
- Add POST `/api/quality/keywords/rewrite` with `{document, jobId, advertFingerprint, keywords}`
  returning `{patches, included, skipped}`. Enforce authentication, Premium, owned saved job,
  ATS/AI switches, keyword validation, budget/rate limits, and existing one-action billing.
- Refund failures and no usable output. Do not persist CVs on the server or run another ATS check.
- Record source CV ID and advert fingerprint on matches; record job provenance on ATS keywords.
  Invalidate matches on advert edits and reject/refund in-flight matches against a changed advert.

## Task 4: Shared client flow

- Extract keyword UI from the ATS panel. Retain Add ticked words to my skills and add a primary
  Rewrite with selected keywords action with count, cost, progress, Cancel and error handling.
- Apply valid changes immediately; show before/after, actual included/skipped terms and Show me.
  Recompute keyword presence from current CV after all edits including Undo/Redo; mark PDF checks stale.
- Bind ATS/report/rewrite responses to UID/session, document, job and request generation.
- Restore completed state and selections per account/workspace/CV only when content and advert
  provenance match. Do not restore pending operations or replay requests. Undo follows editor lifetime.
- Link the job match report to its recorded CV and this same Check flow, preloading terms without
  automatic AI work. Legacy or outdated reports require Check again. No CV text in URLs.
- Support English/German, mobile, keyboard access and the existing AI preference.

## Verification

Use failing-then-passing tests for field guards, factual protection, atomic application, guarded
storage, session cleanup, API ownership/billing/refunds, advert provenance and task fixtures.
Browser tests cover both entry points, actual saved text/preview, one Undo/Redo, partial/noop results,
pending edits, cancellation/offline/retry, account/tab changes, external updates/deletion, legacy
reports, restored state, entitlement/feature/preference gates and desktop/mobile accessibility.
Run `npm run verify` and affected ATS, jobs, editor and workspace browser suites with one worker.

No new dependencies or database migration. Existing task controls support disabling the feature.
Follow-up authorization: run the required CI checks locally, push this branch and open a detailed PR for owner review, merge and deployment. Do not merge or deploy.
