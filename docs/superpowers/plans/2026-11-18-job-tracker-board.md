# Job tracker board implementation

Approved scope: a Notion-style board with fixed stages, saved card order across devices, a horizontal mobile board, existing add/detail flows, and protection from overlapping AI/reminder saves. No custom stages, inline editor, filtering, or live collaboration.

## Implementation tasks

1. Establish dependency/check baseline. Keep work on the existing dedicated feature branch.
2. Add atomic updates to both user stores. Migrate existing job update writers to mutate only owned fields against the latest job. Run external effects once, outside transaction callbacks; never recreate deleted jobs.
3. Add separate account board metadata `{ revision, columns }`, coherent reads, and a transactional move endpoint. Keep Job/JobInput unchanged. Retain unobserved IDs from capped queries. Same-column ordering must never update jobs/history/timestamps.
4. Extract shared board state and add an enhanced renderer with accessible card controls, drag handles, mouse/touch/keyboard sorting, cancellation, drop feedback, error reconciliation, and mobile stage navigation. Preserve current renderer/add/details and URL imports.
5. Gate enhanced UI with server `JOBS_BOARD_V2_ENABLED` (off by default); translate new UI into German, document enable/rollback, verify and review.

## Interfaces

- `UserStore.updateJob(uid, id, edit)` atomically transforms the current Job, returns Job or null if missing. Callback may be retried and must not send messages, charge usage, or run AI.
- `JobBoardState = { revision: number; columns: Record<JobStage, string[]> }` stored at `users/{uid}/jobBoard/main`.
- GET `/api/jobs` adds `board`, preserves `jobs`, `max`, existing listing ordering/cap. Reads are side-effect free and coherent.
- POST `/api/jobs/board/move` accepts `{ jobId, fromStage, toStage, beforeId, revision, expectedJobUpdatedAt }`; returns `{ job, board }`. `beforeId: null` appends. Check ownership, anchor, source stage/timestamp, board revision; 409 on stale moves. Atomic stage and order commit. True no-op writes nothing.
- Generic PUT keeps `applyJobPatch` and `withSent` against the latest job for every edit, including outcomes/appliedOn; board reorder skips both.

## Verification

- RED/GREEN tests for normalization, moves/no-ops/history, scoped concurrent updates, deletion during processing, retries, conflicting moves, account isolation and cleanup, hidden IDs beyond capped listing.
- Existing analytics/reminder/store tests; lint, types, formatting, build and unit suite; Firestore/rules emulators when available.
- Playwright: existing jobs/import/reminders/insights flows, dragging and keyboard controls, reload/session persistence, failure recovery, flag off/on, axe, phone/tablet/desktop/wide visual checks.
- Never claim unavailable checks passed. Initial baseline attempt: Vitest missing before dependency installation.
