# Implementation ledger — 2026-11-18-job-tracker-board

- Base: c4e391456e85bfe7dc1ced3c93d2fc0e831bddd5; dedicated branch feat/drag-and-drop-jobs-listing-across-stages; initially clean.
- Ruling: work in the existing task-specific branch and shared workspace, avoiding a second checkout and sandbox-protected Git metadata changes.
- Plan review corrected generic PUT: retain withSent for outcome/date edits as well as stage/document links.
- Implemented atomic scoped job saves in both stores and migrated existing job writers. AI/mail/usage effects remain outside retryable callbacks.
- Implemented account board metadata, coherent reads, transactional moves, no-op handling, capped-list preservation, and deletion cleanup.
- Implemented the gated renderer, drag handles, mouse/touch/keyboard movement, menu alternatives, horizontal mobile navigation, optimistic state, failure reconciliation, and account lifetime guards.
- Added German UI translations, pinned dnd-kit packages, rollout documentation, and unit/API/emulator/browser coverage.
- Verified: 764 unit tests passed (3 emulator tests skipped in the normal suite); all 3 Firestore emulator tests passed separately; security-rule checks passed; typecheck, formatting, diff checks and production build passed. ESLint has 0 errors and 10 existing warnings in unchanged files.
- Environment: installed a temporary Java 21 JRE and Playwright Chromium under /tmp; used Firestore port 8188 because 8080 belongs to another app. Cleared generated .next cache after an initial sandbox port-binding failure, then built successfully outside the sandbox.
- Independent review completed; fixed hidden Retry after error dismissal, additions lost to a delayed refresh, and duplicate counts when refresh acknowledges creation before POST does. Browser regressions reproduced each bug against the preceding build before fixes. Two refresh-merging unit tests also verified RED/GREEN.
- Browser checks confirmed existing add/edit/delete/limits, URL/text import, reminders/digests, results/CV attribution, account isolation, mouse/touch/keyboard movement, cancellation, menu controls, uncertain commits and conflict reconciliation. Hardened keyboard geometry reads during the post-save measurement handoff. Touch swipes use paced native events so Chromium receives real gesture frames.
- Visually inspected phone (390), tablet (834), desktop (1440) and ultrawide (2770) screenshots. No document overflow at tested sizes; reduced-motion stage navigation and serious/critical axe checks covered.
- Final production browser run: 55 passed, 3 intentional device-specific skips with the feature on; all 36 existing-flow checks passed with it off. Separate ports/processes kept their configuration and account data isolated.
- Local preview: http://localhost:3101/jobs with the board enabled, mock AI, memory storage and a local Auth emulator on 9099. Preview accounts/data are separate from production. Production remains default-off until explicitly enabled.
- Implementation verification complete. Publication to origin and the owner PR follow the user's explicit request. No production rollout performed.
