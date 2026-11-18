# Job tracker board rollout

Set the server environment variable `JOBS_BOARD_V2_ENABLED=1` to use the enhanced tracker. Unset it or set it to `0` to restore the original interface. The default is off. The Playwright server defaults to on; set the variable to `0` when testing rollback. No user records need migration, and saved order survives an interface rollback.

For the production Firebase App Hosting backend, merging to `main` triggers a rollout. This change leaves `apphosting.yaml` unchanged, so the first deployment keeps the original interface unless the flag is already configured externally. After CI and owner review, add the following entry under the existing `env` list in `apphosting.yaml` and roll out that configuration to enable the board:

```yaml
- variable: JOBS_BOARD_V2_ENABLED
  value: '1'
  availability:
    - RUNTIME
```

To roll back the interface, change the value to `'0'` (or remove the entry) and deploy that configuration. An environment change requires a new hosting rollout; it does not change already running instances. No new secrets, Firestore rules or indexes are required. Keep the existing production Firestore configuration; the memory store and emulator settings used by browser tests are local test settings.

After enabling, sign in with an existing account and check adding/importing a job, opening its detail page, moving it between stages, reordering cards and reloading to confirm persistence. Check the Actions menu and keyboard controls, touch scrolling on a phone, linked CVs, reminders and results. In two tabs, attempt a stale move and confirm that the board refreshes before another move. Confirm the original interface after a rollback. Monitor move failures and latency during rollout.

Cards move within or between the five existing stages. The drag handle supports mouse, touch and keyboard; the Actions disclosure provides stage selection and Move up/Move down. Titles still open existing detail pages, and adding/importing jobs uses the existing form and URLs.

Presentation order is private account metadata at `users/{uid}/jobBoard/main`. Reads derive ordering for old data without writing. The job record's stage remains authoritative. New or externally moved jobs appear first until an explicit board move saves their placement. Unobserved IDs from the existing 500-job Firestore listing are retained; only confirmed deletion removes them. Account deletion removes board metadata too.

GET `/api/jobs` preserves its existing fields and ordering, adding `board: { revision, columns }`. POST `/api/jobs/board/move` accepts `jobId`, `fromStage`, `toStage`, nullable `beforeId` (append when null), `revision`, and `expectedJobUpdatedAt`; returns `{ job, board }`. Ownership, source, revision and destination anchors are checked server-side. Stale requests return 409. Stage and order commit together; same-column ordering never changes application content, dates or timestamps.

Job update callbacks run atomically against the latest job. AI, billing and mail remain outside retryable callbacks. Scoped result saves preserve unrelated changes, and deleted jobs are never recreated by delayed results. Ordinary full-draft editing retains existing semantics; this release does not add live collaborative editing.

After an uncertain move response, the client restores its confirmed display and refetches. If refetch fails, movement stays disabled until Retry succeeds. It never replays stale stage intent automatically. `Server-Timing` reports move duration; unexpected failures log a request ID and duration without job content.

Before enabling production, run unit/static/build checks, Firestore/rules emulator tests, and job/import/reminder/insights browser flows with the flag on and off. Review phone, tablet, desktop and wide screenshots, touch scrolling, keyboard movement, reduced motion and axe results. Monitor move status codes (especially 409/500) and latency after enabling. Roll back with the flag if error rates increase; compatible APIs and metadata remain deployed.

Implementation verification on November 18, 2026: 764 unit tests passed; 3 Firestore emulator tests and the security-rule checks passed separately. Production build, typecheck and formatting passed. ESLint reported no errors and 10 existing warnings in unchanged files. Desktop/mobile browser checks passed with the flag on (55, plus 3 intentional device-specific skips) and off (36). Recovery tests cover both creation/refresh response orders, dismissed errors, uncertain commits and stale-tab conflicts. Responsive screenshots and axe checks cover phone through ultrawide layouts.

The local browser runs covered `jobs-board.spec.ts`, `jobs.spec.ts`, `job-url.spec.ts`, `reminders.spec.ts` and `insights.spec.ts` with the flag on, and the same existing-flow suites without `jobs-board.spec.ts` with the flag off. The full repository E2E suite was not run locally. The existing PR CI workflow runs `npm run test:e2e` across the repository; check its result before merging. The three flag-on skips are the desktop touch-only case and the two mobile mouse-only cases.
